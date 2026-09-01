import { describe, expect, it } from 'vitest';
import { STARTER_PROGRAM } from '../../src/starter';

describe('starter program (FR-004, BR-010)', () => {
  it('matches the spec snippet byte for byte', () => {
    expect(STARTER_PROGRAM).toBe(
      '# Bienvenido al playground de Python.\n' +
        '# Escribí tu programa y apretá "Run" (Ctrl/Cmd+Enter).\n' +
        '\n' +
        'nombre = input("¿Cómo te llamás? ")\n' +
        'print(f"Hola, {nombre}!")\n' +
        '\n' +
        'for i in range(1, 6):\n' +
        '    print(i, "al cuadrado es", i * i)\n',
    );
  });

  it('calls input() at least once and print() at least once (BR-010)', () => {
    expect(STARTER_PROGRAM).toContain('input(');
    expect(STARTER_PROGRAM).toContain('print(');
  });
});
