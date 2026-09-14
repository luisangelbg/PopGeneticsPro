#!/usr/bin/perl
# PopGeneticsPro · manual de usuario: reúne las reglas de decisión de los capítulos en el apéndice B.
# Uso, desde la carpeta manual/:   perl herramientas/reunir-reglas.pl es
# Lee los recuadros "caja regla" de 01-introduccion.html a 11-bloque10.html, les añade la sección
# de donde vienen y reescribe el índice y los recuadros entre las marcas "reglas: inicio" y
# "reglas: fin" de 12-apendices.html. La regla de la sección 2.2 se repite en la 6.4 y se omite.
use strict; use warnings; use utf8;
use open qw(:std :encoding(UTF-8));

my $dir = shift or die "uso: perl herramientas/reunir-reglas.pl <carpeta del idioma>\n";
my @caps = (
  ['01-introduccion.html', 'k0',  '1',   'Introducción a PopGeneticsPro'],
  ['02-bloque1.html',      'k1',  'B1',  'Inicio, teoría y simulador'],
  ['03-bloque2.html',      'k2',  'B2',  'Datos y control de calidad'],
  ['04-bloque3.html',      'k3',  'B3',  'Frecuencias alélicas y diversidad'],
  ['05-bloque4.html',      'k4',  'B4',  'Hardy–Weinberg y desequilibrio de ligamiento'],
  ['06-bloque5.html',      'k5',  'B5',  'Diferenciación y AMOVA'],
  ['07-bloque6.html',      'k6',  'B6',  'Distancias, ordenación y árboles'],
  ['08-bloque7.html',      'k7',  'B7',  'Agrupamiento bayesiano y asignación'],
  ['09-bloque8.html',      'k8',  'B8',  'Secuencias de ADN y fechado molecular'],
  ['10-bloque9.html',      'k9',  'B9',  'Demografía y estructura espacial'],
  ['11-bloque10.html',     'k10', 'B10', 'Figuras e informe'],
);
my @indice;
my $cuerpo = '';
my $n = 0;
for my $c (@caps) {
  my ($file, $k, $chip, $name) = @$c;
  open my $fh, '<', "$dir/$file" or die "$file: $!"; local $/; my $t = <$fh>; close $fh;
  # the boxes before the first chapter (the sample of "Cómo leer este manual") are not rules
  my $pos = index($t, '<section class="capitulo"');
  my @reglas;
  while ((my $b = index($t, '<div class="caja regla"', $pos)) >= 0) {
    my ($depth, $end) = (0, undef);
    pos($t) = $b;
    while ($t =~ /(<div\b|<\/div>)/g) { $depth += ($1 eq '</div>') ? -1 : 1; if ($depth == 0) { $end = pos($t); last; } }
    die "recuadro sin cerrar en $file\n" unless defined $end;
    my $box = substr($t, $b, $end - $b);
    my $snum = '';
    my $before = substr($t, 0, $b);
    while ($before =~ /<h2 id="s\d+-\d+"><span class="num">([\d.]+)<\/span>/g) { $snum = $1; }
    $pos = $end;
    my ($tit) = $box =~ /<div class="caja-t"><span class="ico">✓<\/span>(.*?)<\/div>/s;
    next if $snum eq '2.2' && $tit =~ /cuánta diferenciación es mucha/;
    push @reglas, [$snum, $tit, $box];
  }
  next unless @reglas;
  $cuerpo .= qq{\n  <h3 class="ap-cap"><span class="chip $k">$chip</span>$name</h3>\n};
  my @items;
  for my $r (@reglas) {
    my ($snum, $tit, $box) = @$r;
    $n++;
    my $extra = ($snum eq '6.4' && $tit =~ /cuánta diferenciación es mucha/) ? ' y 2.2' : '';
    $box =~ s/^<div class="caja regla"[^>]*>/<div class="caja regla">/;
    $box =~ s{(<div class="caja-t"><span class="ico">✓</span>.*?)</div>}{$1<span class="sec-ref">Sección $snum$extra</span></div>}s;
    $box =~ s/\n    /\n  /g;
    $cuerpo .= "\n  $box\n";
    (my $corto = $tit) =~ s/^(?:<span>)?Regla de decisión · //;
    $corto =~ s/<\/span>$// if $tit =~ /^<span>/;
    $corto =~ s/<span class="sym">(.*?)<\/span>/$1/g;
    $corto =~ s/<span style="[^"]*">(.*?)<\/span>/$1/g;
    $corto = ucfirst $corto;
    $corto =~ s/^¿(\p{Ll})/'¿' . uc $1/e;
    push @items, qq{<li><b>$snum</b>$corto</li>};
  }
  push @indice, qq{    <li class="grupo"><span class="chip $k">$chip</span>$name</li>\n} . join('', map { "    $_\n" } @items);
}
my $bloque = qq{  <ul class="indice-reglas">\n} . join('', @indice) . qq{  </ul>\n} . $cuerpo;

my $ap = "$dir/12-apendices.html";
open my $fh, '<', $ap or die "$ap: $!"; my $html = do { local $/; <$fh> }; close $fh;
my $ini = index($html, '<!-- reglas: inicio');
my $fin = index($html, '<!-- reglas: fin -->');
die "no encuentro las marcas de las reglas en $ap\n" if $ini < 0 || $fin < $ini;
my $tras = index($html, "\n", $ini) + 1;
substr($html, $tras, $fin - $tras) = $bloque;
open my $oh, '>', $ap or die; print $oh $html; close $oh;
print "$n reglas escritas en $ap\n";
