# Google Calendar Colors

## Event Colors

Google Calendar supports these color IDs for events:

| ID  | Color     | Hex       |
| --- | --------- | --------- |
| 1   | Lavender  | `#7986cb` |
| 2   | Sage      | `#33b679` |
| 3   | Grape     | `#8e24aa` |
| 4   | Flamingo  | `#e67c73` |
| 5   | Banana    | `#f6c026` |
| 6   | Tangerine | `#f5511d` |
| 7   | Peacock   | `#039be5` |
| 8   | Graphite  | `#616161` |
| 9   | Blueberry | `#3f51b5` |
| 10  | Basil     | `#0b8043` |
| 11  | Tomato    | `#d50000` |

## Calendar Colors

Calendar list entries can have these color IDs:

- Same numbering as event colors (1-11)
- Plus additional calendar-specific colors

## Using Colors

When creating or updating events via API, use the `colorId` field:

```python
event = {
    'summary': 'Meeting',
    'colorId': '7',  # Peacock blue
    'start': {...},
    'end': {...}
}
```
