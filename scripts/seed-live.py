import json
doc = {"version":2,"doc":{"floors":[{"id":"f1","name":"Этаж 1","room":[{"x":100,"y":100},{"x":500,"y":100},{"x":500,"y":400},{"x":100,"y":400}],"partitions":[],"objects":[{"id":"o1","presetId":"sofa-220","name":"Диван","w":220,"h":90,"x":300,"y":350,"angle":0,"color":"#8C9A7B","layer":"furniture"}],"dimensions":[],"underlay":None,"camera":{"x":300,"y":250,"angle":45}}],"currentFloorId":"f1","gridStep":25,"layers":{"furniture":True,"vent":True,"water":True,"electric":True}},"showGrid":True}
print(json.dumps(json.dumps(doc)))
