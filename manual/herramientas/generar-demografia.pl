# Datos de práctica del capítulo del Bloque 9 (demografía y estructura espacial).
# Son simulados con parámetros conocidos, para comparar lo que estima la app con la verdad.
#
#   ssr-demografia.csv  20 microsatélites (motivo de 2 pb) en tres poblaciones de 40 plantas
#                       que descienden de una misma población ancestral grande en equilibrio
#                       mutación–deriva (modelo de dos fases: 95 % de pasos simples, varianza 12):
#                         Estable         muestra de la población ancestral
#                         Cuello_botella  40 plantas durante 8 generaciones y luego 400; N_e ≈ 40
#                         Autogama        muestra en equilibrio con 60 % de autofecundación: cada planta
#                                         lleva t generaciones seguidas de autofecundación (geométrica), y
#                                         en cada locus sus dos copias son idénticas por descendencia con
#                                         probabilidad 1 − (1/2)^t, así que la endogamia se correlaciona
#                                         entre loci como en una población autógama real
#   ssr-espacial.csv    un rodal continuo de 22 500 plantas en una malla toroidal de 150 × 150 con 5 m entre
#                       plantas, 3000 generaciones de dispersión restringida (semilla σ = 1 celda,
#                       polen σ = 2 celdas desde la madre) y 12 microsatélites; se muestrean con
#                       coordenadas 200 de las 400 plantas de una parcela central de 1 ha
#
# Uso: perl generar-demografia.pl <carpeta de salida>
# Determinista: las semillas del generador están fijas.
use strict; use warnings;

my $OUT = $ARGV[0] // '.';
sub wr { my ($f, $txt) = @_; open(my $fh, '>:encoding(UTF-8)', "$OUT/$f") or die $!; print $fh $txt; close $fh; print "escribí $f\n"; }
sub rnorm { my ($m, $s) = @_; my $u = rand() || 1e-12; my $v = rand(); return $m + $s * sqrt(-2 * log($u)) * cos(2 * 3.14159265358979 * $v); }
sub poisson { my ($l) = @_; return 0 if $l <= 0;
  if ($l > 40) { my $v = int(rnorm($l, sqrt($l)) + 0.5); return $v < 0 ? 0 : $v; }
  my $L = exp(-$l); my $k = 0; my $p = 1; do { $k++; $p *= rand(); } while ($p > $L); return $k - 1; }

# ---------------------------------------------------------------- mutation model (two-phase)
my ($PSINGLE, $SIGMA2) = (0.95, 12);
my $QGEO = (sqrt(1 + 4 * $SIGMA2) - 1) / (2 * $SIGMA2);   # geometric step with variance SIGMA2
sub step { my $s = 1; if (rand() >= $PSINGLE) { $s++ while rand() > $QGEO; } return rand() < 0.5 ? -$s : $s; }

# coalescent sample of n gene copies at mutation–drift equilibrium; returns repeat numbers
sub coalescent { my ($n, $theta) = @_;
  my @lin = (0 .. $n - 1); my $next = $n; my (@par, @tm); $tm[$_] = 0 for 0 .. $n - 1; my $t = 0;
  while (@lin > 1) {
    my $k = @lin; $t += -log(rand() || 1e-12) / ($k * ($k - 1) / 2);
    my $i = int(rand($k)); my $j = int(rand($k - 1)); $j++ if $j >= $i;
    $par[$lin[$i]] = $next; $par[$lin[$j]] = $next; $tm[$next] = $t;
    my ($hi, $lo) = $i > $j ? ($i, $j) : ($j, $i);
    splice(@lin, $hi, 1); splice(@lin, $lo, 1); push @lin, $next++;
  }
  my @st; $st[$next - 1] = 0;
  for (my $v = $next - 2; $v >= 0; $v--) {
    my $p = $par[$v]; my $s = $st[$p];
    my $m = poisson($theta / 2 * ($tm[$p] - $tm[$v])); $s += step() for 1 .. $m;
    $st[$v] = $s;
  }
  return @st[0 .. $n - 1];
}

# one generation of a closed population: $pop is [ [ [a,b] per locus ] per plant ]
sub generation { my ($pop, $size, $self) = @_;
  my $N = @$pop; my $L = @{$pop->[0]}; my @kids;
  for (1 .. $size) {
    my $m = $pop->[int(rand($N))];
    my $f = (rand() < $self) ? $m : $pop->[int(rand($N))];
    push @kids, [ map { [ $m->[$_][int(rand(2))], $f->[$_][int(rand(2))] ] } 0 .. $L - 1 ];
  }
  return \@kids;
}

# ================================================================ ssr-demografia.csv
srand(90911);
{
  my $L = 20; my $n = 40;
  my @theta = map { 4 + rand(6) } 1 .. $L;                   # θ = 4Nμ between 4 and 10
  my @base = map { 100 + 2 * int(rand(60)) } 1 .. $L;       # a different size range for every locus
  my ($Nb, $Tb, $Nafter) = (40, 8, 400);
  my $s = 0.6;
  # consecutive generations of selfing behind each plant of the selfing sample
  my @tself = map { my $t = 0; $t++ while rand() < $s; $t } 1 .. $n;
  my (@est, @fb, @selfed);
  for my $l (0 .. $L - 1) {
    my @ibd = map { rand() < 1 - 0.5 ** $_ } @tself;          # both copies from one ancestral copy
    my $lineages = 0; $lineages += $_ ? 1 : 2 for @ibd;
    my @g = coalescent(2 * $n + 2 * $Nb + $lineages, $theta[$l]);
    for my $i (0 .. $n - 1)     { $est[$i][$l] = [ $g[2 * $i], $g[2 * $i + 1] ]; }
    my $o = 2 * $n;
    for my $i (0 .. $Nb - 1)    { $fb[$i][$l]  = [ $g[$o + 2 * $i], $g[$o + 2 * $i + 1] ]; }
    $o += 2 * $Nb;
    for my $i (0 .. $n - 1) {
      if ($ibd[$i]) { $selfed[$i][$l] = [ $g[$o], $g[$o] ]; $o += 1; }
      else          { $selfed[$i][$l] = [ $g[$o], $g[$o + 1] ]; $o += 2; }
    }
  }
  my $pb = \@fb; $pb = generation($pb, $Nb, 0) for 1 .. $Tb; $pb = generation($pb, $Nafter, 0);
  my @bott = @{$pb}[0 .. $n - 1];                             # the first 40 of 400 random offspring
  # repeat numbers can be negative: shift every locus so its smallest allele is 10 repeats
  my @min = (1e9) x $L;
  for my $set (\@est, \@bott, \@selfed) { for my $p (@$set) { for my $l (0 .. $L - 1) { for my $a (@{$p->[$l]}) { $min[$l] = $a if $a < $min[$l]; } } } }
  my @names = map { sprintf("Ssr%02d", $_) } 1 .. $L;
  my $csv = "Plant,Pop," . join(",", map { "$_,$_" } @names) . "\n";
  my @sets = (['Estable', 'Est', \@est], ['Cuello_botella', 'Cue', \@bott], ['Autogama', 'Aut', \@selfed]);
  for my $set (@sets) {
    my ($pop, $pre, $plants) = @$set; my $i = 0;
    for my $p (@$plants) {
      $i++;
      $csv .= join(",", sprintf("%s%02d", $pre, $i), $pop, map { my $l = $_; map { $base[$l] + 2 * ($_ - $min[$l] + 10) } @{$p->[$l]} } 0 .. $L - 1) . "\n";
    }
  }
  wr('ssr-demografia.csv', $csv);
  printf "  Cuello_botella: N = %d durante %d generaciones y luego %d (N_e verdadero ≈ %d)\n", $Nb, $Tb, $Nafter, $Nb;
  printf "  Autogama: s = %.2f, F en equilibrio = s/(2 − s) = %.3f\n", $s, $s / (2 - $s);
}

# ================================================================ ssr-espacial.csv
srand(31415);
{
  my ($W, $L, $G, $MU, $SPACING) = (150, 12, 3000, 5e-4, 5);
  my ($SIG_SEED, $SIG_POLLEN) = (1, 2);
  my $N = $W * $W;
  # displacement tables: rounded normal deviates; their variance is what the simulation really uses
  my $TAB = 200000;
  my @kseed = map { my $v = rnorm(0, $SIG_SEED); $v < 0 ? -int(-$v + 0.5) : int($v + 0.5) } 1 .. $TAB;
  my @kpol = map { my $v = rnorm(0, $SIG_POLLEN); $v < 0 ? -int(-$v + 0.5) : int($v + 0.5) } 1 .. $TAB;
  my $var = sub { my $s = 0; $s += $_ * $_ for @_; return $s / @_; };
  my ($vs, $vp) = ($var->(@kseed), $var->(@kpol));
  my $sigma2 = $vs + $vp / 2;                                 # axial variance of gene dispersal
  my $Nb = 4 * 3.14159265358979 * $sigma2;                   # density 1 plant per cell
  my @cur = map { int(rand(10)) } 1 .. $N * 2 * $L;
  for my $gen (1 .. $G) {
    my @new;
    $#new = $N * 2 * $L - 1;
    for my $y (0 .. $W - 1) {
      for my $x (0 .. $W - 1) {
        my $o = ($y * $W + $x) * 2 * $L;
        my $mx = ($x + $kseed[int(rand($TAB))]) % $W; my $my = ($y + $kseed[int(rand($TAB))]) % $W;
        my $fx = ($mx + $kpol[int(rand($TAB))]) % $W; my $fy = ($my + $kpol[int(rand($TAB))]) % $W;
        my $mo = ($my * $W + $mx) * 2 * $L; my $fo = ($fy * $W + $fx) * 2 * $L;
        for (my $l = 0; $l < 2 * $L; $l += 2) {
          my $a = $cur[$mo + $l + (rand() < 0.5 ? 0 : 1)];
          my $b = $cur[$fo + $l + (rand() < 0.5 ? 0 : 1)];
          $a += (rand() < 0.5 ? -1 : 1) if rand() < $MU;
          $b += (rand() < 0.5 ? -1 : 1) if rand() < $MU;
          $new[$o + $l] = $a; $new[$o + $l + 1] = $b;
        }
      }
    }
    @cur = @new;
    print "  generación $gen\n" if $gen % 500 == 0;
  }
  # 200 of the 400 plants of the central 20 × 20 cells (a 1-ha plot), far from where the torus closes
  my @cells; for my $y (65 .. 84) { for my $x (65 .. 84) { push @cells, [$x, $y]; } }
  for (my $i = $#cells; $i > 0; $i--) { my $j = int(rand($i + 1)); @cells[$i, $j] = @cells[$j, $i]; }
  my @pick = sort { $a->[1] <=> $b->[1] || $a->[0] <=> $b->[0] } @cells[0 .. 199];
  my @min = (1e9) x $L;
  for my $c (@pick) { my $o = ($c->[1] * $W + $c->[0]) * 2 * $L; for my $l (0 .. $L - 1) { for my $k (0, 1) { my $v = $cur[$o + 2 * $l + $k]; $min[$l] = $v if $v < $min[$l]; } } }
  my @base = map { 150 + 2 * int(rand(40)) } 1 .. $L;
  my ($lat0, $lon0) = (19.21, -98.64);
  my $mlat = 111320; my $mlon = 111320 * cos($lat0 * 3.14159265358979 / 180);
  my @names = map { sprintf("Ssr%02d", $_) } 1 .. $L;
  my $csv = "Plant,Population,Latitude,Longitude," . join(",", map { "$_,$_" } @names) . "\n";
  my $i = 0;
  for my $c (@pick) {
    $i++;
    my $o = ($c->[1] * $W + $c->[0]) * 2 * $L;
    my $lat = $lat0 + ($c->[1] - 65) * $SPACING / $mlat; my $lon = $lon0 + ($c->[0] - 65) * $SPACING / $mlon;
    $csv .= join(",", sprintf("Rod%03d", $i), 'Rodal', sprintf("%.6f", $lat), sprintf("%.6f", $lon),
                 map { my $l = $_; map { $base[$l] + 2 * ($cur[$o + 2 * $l + $_] - $min[$l] + 5) } (0, 1) } 0 .. $L - 1) . "\n";
  }
  wr('ssr-espacial.csv', $csv);
  printf "  varianza axial: semilla %.3f, polen %.3f, dispersión génica σ² = %.3f celdas² (%.1f m²)\n", $vs, $vp, $sigma2, $sigma2 * $SPACING ** 2;
  printf "  densidad %.0f plantas/ha; vecindario Nb = 4πDσ² = %.1f; Sp esperado ≈ 1/Nb = %.4f\n", 10000 / $SPACING ** 2, $Nb, 1 / $Nb;
}
