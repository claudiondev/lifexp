import { AREA_COLORS, AREA_ICONS, createAreaSchema } from '@lifexp/shared';
import { buildDefaultAreaPlan, DEFAULT_AREAS } from './default-areas.js';

describe('áreas padrão (RF08)', () => {
  it('inclui as áreas do público-alvo, com Descanso entre elas (RN15)', () => {
    const names = DEFAULT_AREAS.map((area) => area.name);
    expect(names).toEqual(
      expect.arrayContaining(['Trabalho', 'Estudo', 'Família', 'Fé', 'Saúde', 'Descanso']),
    );
  });

  it('não repete nomes (ignorando maiúsculas)', () => {
    const lowered = DEFAULT_AREAS.map((area) => area.name.toLowerCase());
    expect(new Set(lowered).size).toBe(lowered.length);
  });

  it('só usa cores e ícones da lista compartilhada', () => {
    for (const area of DEFAULT_AREAS) {
      expect(AREA_COLORS).toContain(area.color);
      expect(AREA_ICONS).toContain(area.icon);
    }
  });

  it('cada área passa na mesma validação que a API aplica ao criar uma área', () => {
    for (const area of DEFAULT_AREAS) {
      expect(createAreaSchema.safeParse(area).success).toBe(true);
    }
  });

  it('numera as posições em sequência a partir de 0, na ordem da lista', () => {
    const plan = buildDefaultAreaPlan();
    expect(plan.map((area) => area.position)).toEqual(plan.map((_, index) => index));
    expect(plan.map((area) => area.name)).toEqual(DEFAULT_AREAS.map((area) => area.name));
  });
});
