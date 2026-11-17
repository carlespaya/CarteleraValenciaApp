' Lanza "npm run datos-pc" sin abrir ninguna ventana (lo usa la tarea
' programada "CineValencia - cartelera desde PC"). El registro queda en
' .cache\datos-pc.log
Set fso = CreateObject("Scripting.FileSystemObject")
raiz = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
If Not fso.FolderExists(raiz & "\.cache") Then fso.CreateFolder(raiz & "\.cache")
CreateObject("WScript.Shell").Run "cmd /c cd /d """ & raiz & """ && npm run datos-pc >> .cache\datos-pc.log 2>&1", 0, True
