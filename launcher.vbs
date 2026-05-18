' launcher.vbs - Arranca Speech-to-Prompt sin mostrar ventana de terminal
' Para cambiar el atajo de teclado: clic derecho en el acceso directo > Propiedades > Tecla de metodo abreviado

Dim projectDir
projectDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

Set WshShell = CreateObject("WScript.Shell")

' WindowStyle=0 (oculta) — la terminal no aparece en pantalla
WshShell.Run "cmd /c """ & projectDir & "\launcher.bat""", 0, False
