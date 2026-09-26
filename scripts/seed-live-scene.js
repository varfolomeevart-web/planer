() => {
  const O = (id, presetId, name, x, y, w, h, color) => ({ id, presetId, name, x, y, w, h, angle: 0, color, layer: 'furniture' });
  const floor = {
    id: 'f1', name: 'Этаж 1',
    room: [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 400 }, { x: 0, y: 400 }],
    partitions: [], dimensions: [], underlay: null,
    objects: [
      O('o1', 'dining_table', 'Стол', 250, 150, 160, 90, '#C8A06B'),
      O('o2', 'chair', 'Стул', 250, 60, 45, 50, '#8A6A45'),
      O('o3', 'rug', 'Ковёр', 250, 300, 220, 150, '#D9C4A0'),
      O('o4', 'sofa', 'Диван', 250, 330, 200, 90, '#7E8CA0'),
      O('o5', 'armchair', 'Кресло', 100, 300, 80, 80, '#9A7B5A'),
      O('o6', 'dresser', 'Комод', 450, 120, 120, 50, '#B08850'),
      O('o7', 'coffee_machine', 'Кофемашина', 450, 120, 40, 40, '#3A3A3A'),
      O('o8', 'fridge', 'Холодильник', 60, 80, 70, 70, '#DDE3E8'),
      O('o9', 'bookshelf', 'Стеллаж', 350, 40, 80, 30, '#A0764A'),
    ],
  };
  const payload = {
    version: 2,
    doc: {
      floors: [floor], currentFloorId: 'f1', gridStep: 50,
      layers: { furniture: true, vent: true, water: true, electric: true },
    },
    showGrid: true,
  };
  localStorage.setItem('room-planner-v1', JSON.stringify(payload));
  return 'seeded';
}
