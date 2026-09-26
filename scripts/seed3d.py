# Сид тестовой сцены для проверки 3D-рендера (комната 6×5 м, все типы объектов)
import json

KLEN = '#DCEBD3'

def obj(i, pid, name, x, y, w, h, angle=0, color='#EDE3D3', flip=False, layer='furniture'):
    return {'id': f'o{i}', 'presetId': pid, 'name': name, 'x': x, 'y': y, 'w': w, 'h': h,
            'angle': angle, 'color': color, 'flip': flip, 'layer': layer}

objects = [
    # кухня вдоль верхней стены
    obj(1, 'kitchen_set', 'Кухонный гарнитур', 120, 30, 240, 60),
    obj(2, 'fridge', 'Холодильник', 280, 33, 60, 65, color='#D8D5D0'),
    obj(3, 'stove', 'Плита', 340, 30, 60, 60, color='#D8D5D0'),
    obj(4, 'sink_cab', 'Мойка', 400, 30, 60, 60, color='#D8D5D0'),
    obj(5, 'hood', 'Вытяжка', 340, 30, 60, 60, color='#C6CBD1', layer='vent'),
    obj(6, 'klen_10', 'Витрина кондитерская · ВПВ ADAGIO 900 · 97 367 ₽', 200, 105, 91, 62, color=KLEN),
    obj(7, 'klen_5', 'Вок-плита индукционная · INDOKOR IN5000S WOK · 26 852 ₽', 280, 105, 57, 49, color=KLEN),
    # столовая зона
    obj(8, 'dining_table', 'Обеденный стол', 300, 200, 140, 80, color='#DDBB8B'),
    obj(9, 'chair', 'Стул', 215, 175, 45, 45, angle=270, color='#C9A87E'),
    obj(10, 'chair', 'Стул', 215, 225, 45, 45, angle=270, color='#C9A87E'),
    obj(11, 'chair', 'Стул', 385, 175, 45, 45, angle=90, color='#C9A87E'),
    obj(12, 'chair', 'Стул', 385, 225, 45, 45, angle=90, color='#C9A87E'),
    obj(13, 'chandelier', 'Люстра', 300, 200, 60, 60, color='#F0B5B5', layer='electric'),
    obj(14, 'klen_12', 'Ванна моечная односекционная · ВМСб-630 Base · 8 530 ₽', 350, 300, 63, 63, color=KLEN),
    obj(15, 'klen_14', 'Стол производственный пристенный · СПП 9/6 э · 8 436 ₽', 450, 295, 90, 60, color=KLEN),
    obj(16, 'klen_8', 'Зонт вытяжной пристенный · Luxstahl ЗВП 800×1100 · 22 668 ₽', 450, 295, 110, 80, color=KLEN),
    # гостиная
    obj(17, 'rug', 'Ковёр', 150, 360, 200, 140, color='#E9D9C2'),
    obj(18, 'coffee_table', 'Журнальный столик', 150, 340, 110, 60, color='#DDBB8B'),
    obj(19, 'sofa', 'Диван', 150, 445, 220, 90, angle=180),
    obj(20, 'tv_stand', 'ТВ-тумба', 150, 285, 160, 45, color='#DDBB8B'),
    obj(21, 'plant', 'Растение', 35, 465, 40, 40, color='#C7D2BB'),
    obj(22, 'bookshelf', 'Стеллаж', 60, 300, 90, 32, angle=90, color='#C9A87E'),
    # спальня справа
    obj(23, 'bed_double', 'Кровать 2-сп.', 515, 145, 160, 200),
    obj(24, 'nightstand', 'Тумбочка', 450, 240, 45, 40, color='#C9A87E'),
    obj(25, 'wardrobe', 'Шкаф', 60, 105, 180, 60, angle=90, color='#DDBB8B'),
    obj(26, 'stairs_straight', 'Лестница прямая', 545, 355, 100, 280, color='#EAD9B0'),
]

doc = {
    'version': 2,
    'doc': {
        'floors': [{
            'id': 'bb5zhhztrxb',
            'name': 'Этаж 1',
            'room': [{'x': 0, 'y': 0}, {'x': 600, 'y': 0}, {'x': 600, 'y': 500}, {'x': 0, 'y': 500}],
            'partitions': [{'id': 'p1', 'pts': [{'x': 130, 'y': 140}, {'x': 420, 'y': 140}]}],
            'objects': objects,
            'dimensions': [],
            'underlay': None,
        }],
        'currentFloorId': 'bb5zhhztrxb',
        'gridStep': 25,
        'layers': {'furniture': True, 'vent': True, 'water': True, 'electric': True},
    },
    'showGrid': True,
}

with open('/tmp/seed3d.json', 'w', encoding='utf-8') as f:
    json.dump(json.dumps(doc, ensure_ascii=False), f)
print('ok', len(json.dumps(doc)))
