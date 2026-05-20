## Page_Column: Select
```json
{
    "options": { 
        "id": string, // ULID
        "value": string, // Text Description
        "color": string // TYPEFROM: ColorOptions
    }
}
```

## Page_Column_Value
### Date
```json
{"value":"yyyy-mm-ddT00:00:00.000Z"} // Ou yyyy-mm-ddT00:00:00.000Z@yyyy-mm-ddT00:00:00.000Z
```
### Select
```json
{"value":"<ulid>"}
```
### Checkbox
```json
{"value":boolean}
```