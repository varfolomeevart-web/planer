() => {
  const O = (id, presetId, name, x, y, w, h, color) => ({ id, presetId, name, x, y, w, h, angle: 0, color, layer: 'furniture' });
  const floor = {
    id: 'f1', name: 'Этаж 1',
    room: [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 400 }, { x: 0, y: 400 }],
    partitions: [], dimensions: [], underlay: null,
    objects: [
      O('o1', 'door_single', 'Дверь старая', 250, 400, 80, 12, '#F5EFE3'),
      O('o2', 'stairs_straight', 'Лестница старая', 440, 200, 100, 280, '#EAD9B0', { showNext: true }),
      O('o3', 'fridge', 'Холодильник', 60, 80, 60, 65, '#D8D5D0'),
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
  return 'seeded-v2-old';
}
