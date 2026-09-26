() => {
  const O = (id, presetId, name, x, y, w, h, color, extra = {}) => ({ id, presetId, name, x, y, w, h, angle: 0, color, layer: 'furniture', ...extra });
  const floor = {
    id: 'f1', name: 'Этаж 1',
    room: [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 400 }, { x: 0, y: 400 }],
    partitions: [], dimensions: [], underlay: null,
    ceilingHeightCm: 300,
    floorMaterial: { kind: 'porcelain', desc: 'керамогранит 60×60, серый' },
    wallMaterial: { kind: 'paint', desc: 'матовая, тёплый белый' },
    ceilingMaterial: { kind: 'paint', desc: 'белая матовая' },
    levelNotes: 'подиум в зоне дивана +15 см; потолок над кухней 250 см',
    renderNotes: 'окна от пола в будущем; высокий плинтус 12 см',
    objects: [
      O('o1', 'door_single', 'Входная дверь', 250, 400, 90, 12, '#F5EFE3', { heightCm: 210, opening: { openType: 'swing-right', desc: 'с доводчиком' } }),
      O('o2', 'window_180', 'Окно витраж', 250, 0, 180, 14, '#D7E5EC', { heightCm: 150, opening: { sillCm: 90, desc: 'двухкамерный стеклопакет' } }),
      O('o3', 'stairs_straight', 'Лестница', 440, 200, 100, 280, '#EAD9B0', { heightCm: 170, showNext: true, stairs: { kind: 'straight', steps: 16, ascent: 'top', material: 'дерево (дуб) на металлокаркасе' } }),
      O('o4', 'fridge', 'Холодильный шкаф', 60, 80, 60, 65, '#D8D5D0', { heightCm: 200, model: 'Холодильный шкаф POLAIR ШХ-0,5 ДС', material: { kind: 'metal', desc: 'нержавеющая сталь' } }),
      O('o5', 'dining_table', 'Обеденный стол', 250, 150, 160, 90, '#DDBB8B', { heightCm: 75, material: { kind: 'wood', desc: 'дуб, масло' } }),
      O('o6', 'chair', 'Стул', 250, 60, 45, 50, '#C9A87E', { heightCm: 85 }),
      O('o7', 'sofa', 'Диван', 250, 330, 220, 90, '#EDE3D3', { heightCm: 75, material: { kind: 'fabric', desc: 'рогожка, графит' } }),
    ],
  };
  const payload = {
    version: 3,
    doc: {
      floors: [floor], currentFloorId: 'f1', gridStep: 50,
      layers: { furniture: true, vent: true, water: true, electric: true },
    },
    showGrid: true,
  };
  localStorage.setItem('room-planner-v1', JSON.stringify(payload));
  return 'seeded-v3';
}
