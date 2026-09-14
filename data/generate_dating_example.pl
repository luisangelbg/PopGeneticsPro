#!/usr/bin/perl
# PopGeneticsPro — synthetic example for dating with fossils: 16 species of five
# invented genera plus a two-species outgroup, simulated on a KNOWN dated tree so
# the estimated ages can be checked against the truth.
#
#   model  HKY85 (kappa 4, base frequencies A .30 C .20 G .20 T .30)
#          + discrete Gamma rate variation among sites (alpha 0.5, four categories)
#   clock  uncorrelated lognormal relaxed clock, mean 0.0015 subs/site/Myr, sigma 0.25
#   length 1600 aligned sites, with two indels coded as gaps
#
# Genus and species names are invented; the fossils are fictitious. Run from the
# app folder:  perl data/generate_dating_example.pl
use strict;
use warnings;

srand(20260913);

my $L = 1600;
my $RATE = 0.0015;
my $SIGMA = 0.25;
my $KAPPA = 4;
my @PI = (0.30, 0.20, 0.20, 0.30);
my @B = qw(A C G T);
my @GAMMA = (0.03338, 0.25191, 0.82026, 2.89445);   # category means, alpha = 0.5

# ---- the true tree: [label, age (Ma), children]; tips are at age 0
sub tip { return { name => $_[0], age => 0, kids => [] } }
sub node { my ($age, @k) = @_; return { age => $age, kids => \@k } }

my $tree = node(62,
  node(20, tip('Exterocarpus_borealis'), tip('Exterocarpus_palustris')),
  node(48,
    node(34,
      node(12, tip('Fictaria_alba'), node(5, tip('Fictaria_montana'), tip('Fictaria_rubra'))),
      node(18, node(7, tip('Modelanthus_gracilis'), tip('Modelanthus_major')), tip('Modelanthus_minor'))),
    node(40,
      node(22, tip('Demoxylon_sylvestre'), node(10, tip('Demoxylon_orientale'), tip('Demoxylon_australe'))),
      node(27,
        node(9, tip('Probocarpa_nana'), tip('Probocarpa_elata')),
        node(15, tip('Testiflora_aurea'), node(6, tip('Testiflora_lutea'), tip('Testiflora_vernalis')))))));

sub rnorm { my $u1 = rand() || 1e-12; my $u2 = rand(); return sqrt(-2 * log($u1)) * cos(6.283185307179586 * $u2); }

sub draw { my @p = @_; my $u = rand(); my $c = 0; for my $i (0..$#p) { $c += $p[$i]; return $i if $u < $c; } return $#p; }

# HKY rate matrix scaled to one substitution per unit time
my @Q;
my $scale = 0;
for my $i (0..3) {
  for my $j (0..3) {
    next if $i == $j;
    my $ts = ($i + $j == 2 && $i != $j) || ($i + $j == 4 && $i != $j);   # A<->G (0,2) and C<->T (1,3)
    $Q[$i][$j] = $PI[$j] * ($ts ? $KAPPA : 1);
    $scale += $PI[$i] * $Q[$i][$j];
  }
}
for my $i (0..3) { for my $j (0..3) { $Q[$i][$j] /= $scale if $i != $j; } }
my @out = map { my $i = $_; my $s = 0; $s += $Q[$i][$_] for grep { $_ != $i } 0..3; $s } 0..3;

my @siteRate = map { $GAMMA[int(rand(4))] } 1..$L;

# evolve one site along a branch of expected length b (subs/site at rate 1)
sub evolve {
  my ($state, $b) = @_;
  my $t = 0;
  while (1) {
    $t += -log(rand() || 1e-12) / $out[$state];
    last if $t > $b;
    my @p = map { $_ == $state ? 0 : $Q[$state][$_] / $out[$state] } 0..3;
    $state = draw(@p);
  }
  return $state;
}

my %seq;
sub descend {
  my ($nd, $parentSeq) = @_;
  for my $k (@{ $nd->{kids} }) {
    my $dur = $nd->{age} - $k->{age};
    my $r = $RATE * exp($SIGMA * rnorm() - $SIGMA * $SIGMA / 2);
    my @s = map { evolve($parentSeq->[$_], $r * $dur * $siteRate[$_]) } 0..$L - 1;
    if (defined $k->{name}) { $seq{ $k->{name} } = \@s; } else { descend($k, \@s); }
  }
}
my @root = map { draw(@PI) } 1..$L;
descend($tree, \@root);

my @names = sort { genusOrder($a) <=> genusOrder($b) or $a cmp $b } keys %seq;
sub genusOrder { my @g = qw(Fictaria Modelanthus Demoxylon Probocarpa Testiflora Exterocarpus); my ($n) = @_; for my $i (0..$#g) { return $i if index($n, $g[$i]) == 0; } return 99; }

my %text = map { $_ => join('', map { $B[$_] } @{ $seq{$_} }) } @names;
# two indels: a 6-bp deletion shared by Testiflora and a 9-bp deletion in the outgroup
for my $n (grep { /^Testiflora/ } @names) { substr($text{$n}, 412, 6) = '-' x 6; }
for my $n (grep { /^Exterocarpus/ } @names) { substr($text{$n}, 1105, 9) = '-' x 9; }

my $fa = '';
for my $n (@names) {
  my ($genus) = $n =~ /^([^_]+)/;
  my $s = $text{$n};
  $s =~ s/(.{60})/$1\n/g;
  $s .= "\n" unless $s =~ /\n$/;
  $fa .= ">$n | $genus\n$s";
}
open(my $fh, '>', 'data/genera_dating.fasta') or die $!;
binmode($fh);
print $fh $fa;
close $fh;
print "wrote data/genera_dating.fasta (", scalar(@names), " sequences, $L sites)\n";
