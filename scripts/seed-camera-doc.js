const doc = {
  version: 2,
  doc: {
    floors: [{
      id: 'f1', name: 'Этаж 1',
      room: [{x:100,y:100},{x:500,y:100},{x:500,y:400},{x:100,y:400}],
      partitions: [],
      objects: [
        {id:'o1',presetId:'sofa-220',name:'Диван',w:220,h:90,x:300,y:350,angle:0,color:'#8C9A7B',layer:'furniture'},
        {id:'o2',presetId:'tv-160',name:'ТВ-тумба',w:160,h:45,x:300,y:130,angle:0,color:'#7A6A55',layer:'furniture'}
      ],
      dimensions: [],
      underlay: null,
      camera: { x: 300, y: 250, angle: 45 }
    }],
    currentFloorId: 'f1',
    gridStep: 25,
    layers: { furniture: true, vent: true, water: true, electric: true }
  },
  showGrid: true
};
localStorage.setItem('room-planner-v1', JSON.stringify(doc));
'done';
