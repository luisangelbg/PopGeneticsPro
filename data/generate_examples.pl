# Generates the synthetic example datasets for PopGeneticsPro.
# Deterministic: srand is fixed, so the files can be regenerated identically.
use strict; use warnings;
binmode(STDOUT, ':encoding(UTF-8)');

my $OUT = $ARGV[0] or die "usage: perl gen_examples.pl <data dir>\n";

sub wr { my ($f, $txt) = @_; open(my $fh, '>:encoding(UTF-8)', "$OUT/$f") or die $!; print $fh $txt; close $fh; print "wrote $f\n"; }
sub rnorm { my ($m,$s)=@_; my $u=rand()||1e-9; my $v=rand()||1e-9; return $m + $s*sqrt(-2*log($u))*cos(2*3.14159265358979*$v); }
sub pick { my ($f)=@_; my $r=rand(); my $c=0; for my $i (0..$#$f) { $c+=$f->[$i]; return $i if $r<=$c; } return $#$f; }
sub dirichlet { my ($k,$a)=@_; my @g; my $s=0;
  for (1..$k) { my $x=0; for (1..int($a)) { $x -= log(rand()||1e-9); } $x += -log(rand()||1e-9)*($a-int($a)); $x=1e-6 if $x<=0; push @g,$x; $s+=$x; }
  return [map { $_/$s } @g]; }

# ---------------------------------------------------------------- SSR
srand(20260911);
{
  my @pops  = (['Conico',25], ['Chalqueno',25], ['Palomero',25]);
  my @loci  = qw(phi024 phi053 umc1147 bnlg1017 phi072 umc1304 bnlg1621 phi096);
  my @nall  = (5, 7, 4, 6, 8, 5, 6, 4);      # alleles per locus
  my @base  = (118, 152, 96, 180, 210, 134, 166, 88);  # allele size in bp
  my $F     = 0.16;                            # heterozygote deficit, typical of maize landraces
  my $miss  = 0.04;

  # ancestral frequencies, then drift each population away from them (F_ST ~ 0.08)
  my @freq;
  for my $l (0..$#loci) {
    my $anc = dirichlet($nall[$l], 2.0);
    for my $p (0..$#pops) {
      my @f = map { $_ * exp(rnorm(0, 0.55)) } @$anc;
      my $s = 0; $s += $_ for @f;
      $freq[$p][$l] = [map { $_/$s } @f];
    }
  }
  my $csv = "Ind,Pop," . join(",", map { "$_,$_" } @loci) . "\n";
  my $n = 1;
  for my $p (0..$#pops) {
    my ($pname, $np) = @{$pops[$p]};
    for my $i (1..$np) {
      my @cells = (sprintf("%s%02d", substr($pname,0,3), $i), $pname);
      for my $l (0..$#loci) {
        if (rand() < $miss) { push @cells, 0, 0; next; }
        my $a1 = pick($freq[$p][$l]);
        my $a2 = (rand() < $F) ? $a1 : pick($freq[$p][$l]);
        push @cells, $base[$l] + 2*$a1, $base[$l] + 2*$a2;
      }
      $csv .= join(",", @cells) . "\n";
      $n++;
    }
  }
  wr('maize_ssr_populations.csv', $csv);
}

# ---------------------------------------------------------------- AFLP
srand(77001);
{
  my @pops = (['Oaxaca_north', 20, 17.62, -96.72], ['Oaxaca_south', 20, 16.41, -96.05],
              ['Puebla',       20, 18.84, -97.39], ['Guerrero',     20, 17.55, -99.51]);
  my $nb = 60;
  my @freq;
  for my $b (0..$nb-1) {
    my $anc = 0.15 + rand()*0.7;
    for my $p (0..$#pops) {
      my $q = $anc + rnorm(0, 0.16);
      $q = 0.02 if $q < 0.02; $q = 0.98 if $q > 0.98;
      $freq[$p][$b] = $q;
    }
  }
  my $csv = "Plant,Population,Latitude,Longitude," . join(",", map { sprintf("B%03d", $_+1) } (0..$nb-1)) . "\n";
  for my $p (0..$#pops) {
    my ($pname, $np, $lat, $lon) = @{$pops[$p]};
    for my $i (1..$np) {
      my @cells = (sprintf("%s_%02d", $pname, $i), $pname,
                   sprintf("%.4f", $lat + rnorm(0,0.02)), sprintf("%.4f", $lon + rnorm(0,0.02)));
      for my $b (0..$nb-1) { push @cells, (rand() < $freq[$p][$b] ? 1 : 0); }
      $csv .= join(",", @cells) . "\n";
    }
  }
  wr('agave_aflp.csv', $csv);
}

# ---------------------------------------------------------------- morphology
srand(4242);
{
  my @pops = (['Conico',25,'high'], ['Chalqueno',25,'high'], ['Palomero',25,'low']);
  my @traits = (
    ['PlantHeight_cm',   [235, 268, 186], [22, 25, 18]],
    ['EarLength_cm',     [14.2, 17.6, 9.4], [1.7, 2.1, 1.1]],
    ['EarDiameter_mm',   [43, 49, 28], [4, 5, 3]],
    ['KernelRows',       [12.4, 13.8, 15.2], [1.4, 1.6, 1.8]],
    ['KernelsPerRow',    [24, 29, 33], [3.2, 3.6, 4.1]],
    ['CobWeight_g',      [38, 52, 19], [6, 8, 3.5]],
    ['Weight100Kernels_g',[27.5, 33.1, 12.8], [3.1, 3.8, 1.6]],
    ['DaysToFlowering',  [78, 84, 70], [4, 5, 3.5]],
    ['LeafWidth_cm',     [8.9, 9.8, 7.1], [0.9, 1.1, 0.8]],
  );
  my $csv = "Plant,Pop," . join(",", map { $_->[0] } @traits) . "\n";
  for my $p (0..$#pops) {
    my ($pname, $np) = @{$pops[$p]};
    for my $i (1..$np) {
      my @cells = (sprintf("%s%02d", substr($pname,0,3), $i), $pname);
      for my $t (@traits) {
        my $v = rnorm($t->[1][$p], $t->[2][$p]);
        my $int = ($t->[0] eq 'KernelRows' or $t->[0] eq 'KernelsPerRow' or $t->[0] eq 'DaysToFlowering');
        push @cells, ($int ? sprintf("%.0f",$v) : sprintf("%.1f",$v));
      }
      $csv .= join(",", @cells) . "\n";
    }
  }
  wr('maize_morphology.csv', $csv);
}

# ---------------------------------------------------------------- cpDNA
srand(9090);
{
  my @pops = (['Sierra_Norte', 12], ['Sierra_Sur', 12], ['Cofre', 12], ['Nevado', 12]);
  my $len = 480;
  my @bases = qw(A C G T);
  my @anc = map { $bases[int(rand(4))] } (1..$len);
  # 11 variable sites define 8 haplotypes
  my @sites = ();
  while (@sites < 11) { my $s = int(rand($len)); push @sites, $s unless grep { $_ == $s } @sites; }
  my @haps;
  for my $h (0..7) {
    my @seq = @anc;
    for my $k (0..$#sites) {
      if (($h >> ($k % 3)) & 1 or rand() < 0.35) {
        my $cur = $seq[$sites[$k]];
        my @alt = grep { $_ ne $cur } @bases;
        $seq[$sites[$k]] = $alt[int(rand(3))];
      }
    }
    push @haps, join('', @seq);
  }
  # each population draws from its own haplotype pool
  my @pool = ([0,0,0,1,1,2], [1,1,2,2,3,3], [4,4,4,5,5,0], [6,6,7,7,5,4]);
  my $fa = '';
  for my $p (0..$#pops) {
    my ($pname, $np) = @{$pops[$p]};
    for my $i (1..$np) {
      my $h = $pool[$p][int(rand(scalar @{$pool[$p]}))];
      $fa .= sprintf(">%s_%02d | %s\n", $pname, $i, $pname);
      my $s = $haps[$h];
      $s =~ s/(.{60})/$1\n/g;
      $s .= "\n" unless $s =~ /\n$/;
      $fa .= $s;
    }
  }
  wr('pine_cpdna.fasta', $fa);
}
