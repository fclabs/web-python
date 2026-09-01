/**
 * Built-in starter program (FR-004, BR-010).
 * Copied byte-for-byte from the spec's *Data & Interfaces* section.
 */
export const STARTER_PROGRAM = [
  '# Bienvenido al playground de Python.',
  '# Escribí tu programa y apretá "Run" (Ctrl/Cmd+Enter).',
  '',
  'nombre = input("¿Cómo te llamás? ")',
  'print(f"Hola, {nombre}!")',
  '',
  'for i in range(1, 6):',
  '    print(i, "al cuadrado es", i * i)',
  '',
].join('\n');
