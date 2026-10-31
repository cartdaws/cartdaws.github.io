# Rebuilds every game-ready GLB from the Blender scripts in this folder (Blender 5.x).
$blender = "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
$root = Split-Path $PSScriptRoot -Parent
foreach ($asset in @('kit', 'hand', 'tentacle', 'robots', 'body', 'home', 'creature', 'creature_parts')) {
  & $blender -b --python "$PSScriptRoot\build_$asset.py" -- "$root\public\models\$asset.glb" "$PSScriptRoot\$asset.blend" 2>&1 | Select-String 'KIT |EXPORTED|HAND|TENTACLE|ROBOTS|BODY|HOME|PARTS|Traceback|Error'
}
