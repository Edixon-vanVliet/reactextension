import * as vscode from 'vscode';

export default class CodeActionProvider implements vscode.CodeActionProvider {
    private _commandIds = {
        ctorFromProperties: 'reactextension.ctorFromProperties',
        initializeMemberFromCtor: 'reactextension.initializeMemberFromCtor',
    };

    constructor() {
        vscode.commands.registerCommand(this._commandIds.initializeMemberFromCtor, this.initializeMemberFromCtor, this);

        vscode.commands.registerCommand(this._commandIds.ctorFromProperties, this.executeCtorFromProperties, this);
    }

    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext, token: vscode.CancellationToken) : vscode.Command[] {
        var commands = [];

        let addInitializeFromCtor = (type: MemberGenerationType) => {
            var cmd = this.getInitializeFromCtorCommand(document, range, context, token, type);

            if (cmd) {
                commands.push(cmd);
            }
        };

        addInitializeFromCtor(MemberGenerationType.PrivateField);
        addInitializeFromCtor(MemberGenerationType.ReadonlyProperty);
        addInitializeFromCtor(MemberGenerationType.Property);

        var ctorPCommand = this.getCtorpCommand(document, range, context, token);

        if (ctorPCommand) {
            commands.push(ctorPCommand);
        }

        return commands;
    }

    private camelize(str: string) {
        return str.replace("", (match: any, index: number) => {
            if (+match === 0) {
                return ""; //or if (/\s+/.test(match)) for white spaces
            }

            return index === 0 ? match.toLowerCase() : match.toUpperCase();
        });
    }

    private executeCtorFromProperties(args: ConstructorFromPropertiesArgument) {
        var tabSize = vscode.workspace.getConfiguration().get('editor.tabSize', 2);
        let ctorParams: string[] = [];

        if (!args.properties) {
            return;
        }

        args.properties.forEach(p => {
            ctorParams.push(`${p.type} ${this.camelize(p.name)}`);
        });

        let assignments: string[] = [];
        args.properties.forEach(p => {
            assignments.push(`${Array(tabSize * 1).join(' ')} this.${p.name} = ${this.camelize(p.name)};`);
        });

        let firstPropertyLine = args.properties.sort((a, b) => {
            return a.lineNumber - b.lineNumber;
        })[0].lineNumber;

        var ctorStatement = `${Array(tabSize * 2).join(' ')} ${args.classDefinition.modifier} ${args.classDefinition.className}(${ctorParams.join(', ')}) 
        {
            ${assignments.join('')}
        }
        `;

        let edit = new vscode.WorkspaceEdit();
        let edits: vscode.TextEdit[] = [];

        let pos = new vscode.Position(firstPropertyLine, 0);
        let range = new vscode.Range(pos, pos);
        let ctorEdit = new vscode.TextEdit(range, ctorStatement);

        edits.push(ctorEdit);
        edit.set(args.document.uri, edits);

        let reFormatAfterChange = vscode.workspace.getConfiguration().get('reactextension.reFormatAfterChange', true);

        let applyPromise = vscode.workspace.applyEdit(edit);

        if (reFormatAfterChange) {
            applyPromise.then(() => {
                vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', args.document.uri)
                .then((formattingEdits: any)=>{
                    var formatEdit = new vscode.WorkspaceEdit();
                    formatEdit.set(args.document.uri,formattingEdits);
                    vscode.workspace.applyEdit(formatEdit);    
                });
            });
        }
    }

    private getCtorpCommand(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext, token: vscode.CancellationToken) {
        const editor = vscode.window.activeTextEditor!;
        const position = editor.selection.active;

        let withinClass = this.findClassFromLine(document, position.line);

        if (!withinClass) {
            return null;
        }

        let properties = [];
        let lineNo = 0;

        while (lineNo < document.lineCount) {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            let ReadonlyRegex = new RegExp(/(public|private|protected)\s(\w+)\s(\w+)\s?{\s?(get;)\s?(private\s)?(set;)?\s?}/g);
            let textLine = document.lineAt(lineNo);
            let match = ReadonlyRegex.exec(textLine.text);

            if (match) {
                let clazz = this.findClassFromLine(document, lineNo);

                if (clazz?.className === withinClass.className) {
                    let prop: CSharpPropertyDefinition = {
                        lineNumber: lineNo,
                        class: clazz,
                        modifier: match[1],
                        type: match[2],
                        name: match[3],
                        statement: match[0]
                    };

                    properties.push(prop);
                }
            }

            lineNo += 1;
        }

        if (!properties.length) {
            return null;
        }

        var classDefinition = this.findClassFromLine(document, position.line);

        if (!classDefinition) {
            return;
        }

        var parameter : ConstructorFromPropertiesArgument = {
            properties: properties,
            classDefinition: classDefinition,
            document: document
        };

        let cmd: vscode.Command = {
            title: "Initialize ctor from properties...",
            command: this._commandIds.ctorFromProperties,
            arguments: [parameter]
        };

        return cmd;
    }

    private findClassFromLine(document: vscode.TextDocument, lineNo: number) {
        var classRegex = new RegExp(/(private|internal|public|protected)\s?(static)?\sclass\s(\w*)/g);  

        while(lineNo > 0){
            var line = document.lineAt(lineNo);
            let match;

            if((match = classRegex.exec(line.text))){                
                return {
                    startLine: lineNo,
                    endLine: -1,
                    className: match[3],
                    modifier: match[1],
                    statement: match[0]
                };
            }
            
            lineNo -=1;
        }
        return null;
    }

    private initializeMemberFromCtor(args: InitializeFieldFromConstructor) {
        let edit = new vscode.WorkspaceEdit();
        
        var bodyStartRange = new vscode.Range(args.constructorBodyStart!, args.constructorBodyStart!);
        var declarationRange = new vscode.Range(args.constructorStart, args.constructorStart);
        
        let declarationEdit = new vscode.TextEdit(declarationRange, args.memberGeneration.declaration);
        let memberInitEdit = new vscode.TextEdit(bodyStartRange, args.memberGeneration.assignment);

        var edits = [];
        if(args.document.getText().indexOf(args.memberGeneration.declaration.trim()) === -1){
            edits.push(declarationEdit);
        }
        
        if(args.document.getText().indexOf(args.memberGeneration.assignment.trim()) ===  -1){
            edits.push(memberInitEdit);
        }
        
        edit.set(args.document.uri, edits);
        
        var reFormatAfterChange = vscode.workspace.getConfiguration().get('csharpextensions.reFormatAfterChange', true);
        var applyPromise = vscode.workspace.applyEdit(edit);

        if(reFormatAfterChange){
            applyPromise.then(()=>{
                vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', args.document.uri).then((formattingEdits: any)=>{
                    var formatEdit = new vscode.WorkspaceEdit();
                    formatEdit.set(args.document.uri,formattingEdits);
                    vscode.workspace.applyEdit(formatEdit);    
                });
            });
        }
    }

    private getInitializeFromCtorCommand(document:vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext, token: vscode.CancellationToken, memberGenerationType: MemberGenerationType) {
        const editor = vscode.window.activeTextEditor!;        
        const position = editor.selection.active;
        var surrounding = document.getText(new vscode.Range(new vscode.Position(position.line-2,0),new vscode.Position(position.line+2,0)));
        let wordRange = editor.document.getWordRangeAtPosition(position);
        
        if (!wordRange) {
            return null;
        }

        var regex = new RegExp(/(public|private|protected)\s(.*?)\(([\s\S]*?)\)/gi);
        var matches = regex.exec(surrounding);

        if (!matches) {
            return null;
        }

        var ctorStartPos = editor.document.getText().indexOf(matches[0]);        

        var ctorParamStr = matches[3];
        let parameters: any = {};
        ctorParamStr.split(',').forEach((match)=>{
            var separated = match.trim().split(' ');
            var type = separated[0].trim();
            var name = separated[1].trim();
            parameters[name] = type;
        });
        
        var lineText = editor.document.getText(new vscode.Range(position.line,0,position.line,wordRange.end.character));
        var selectedName = lineText.substr(wordRange.start.character,wordRange.end.character-wordRange.start.character);
        var parameterType  = parameters[selectedName];
        if(!parameterType){
            return;
        }
        
        var tabSize = vscode.workspace.getConfiguration().get('editor.tabSize', 4);
        var privateMemberPrefix = vscode.workspace.getConfiguration().get('csharpextensions.privateMemberPrefix', '');
        var prefixWithThis = vscode.workspace.getConfiguration().get('csharpextensions.useThisForCtorAssignments', true);

        let memberGeneration: MemberGenerationProperties = {
            assignment: "",
            declaration: "",
            type: memberGenerationType
        };
        
        let title = "";
        if(memberGenerationType === MemberGenerationType.PrivateField){
            title = "Initialize field from parameter...";
            memberGeneration = {
                type: memberGenerationType,
                declaration: `${Array(tabSize*2).join(' ')} private readonly ${parameterType} ${privateMemberPrefix}${selectedName};\r\n`,
                assignment: `${Array(tabSize*3).join(' ')} ${(prefixWithThis?'this.':'')}${privateMemberPrefix}${selectedName} = ${selectedName};\r\n`
            };
        } else if( memberGenerationType === MemberGenerationType.ReadonlyProperty){
            title = "Initialize readonly property from parameter...";
            var name = selectedName[0].toUpperCase()+selectedName.substr(1);
            memberGeneration = {
                type: memberGenerationType,
                declaration: `${Array(tabSize*2).join(' ')} public ${parameterType} ${name} { get; }\r\n`,
                assignment: `${Array(tabSize*3).join(' ')} ${(prefixWithThis?'this.':'')}${name} = ${selectedName};\r\n`
            };
        } else if( memberGenerationType === MemberGenerationType.Property){
            title = "Initialize property from parameter...";
            var name = selectedName[0].toUpperCase()+selectedName.substr(1);
            memberGeneration = {
                type: memberGenerationType,
                declaration: `${Array(tabSize*2).join(' ')} public ${parameterType} ${name} { get;set; }\r\n`,
                assignment: `${Array(tabSize*3).join(' ')} ${(prefixWithThis?'this.':'')}${name} = ${selectedName};\r\n`
            };
        }
        
        var parameter:InitializeFieldFromConstructor = {
            document: document,            
            type: parameterType,
            name: selectedName,
            memberGeneration: memberGeneration,
            constructorBodyStart: this.findConstructorBodyStart(document, position),
            constructorStart: this.findConstructorStart(document,position)
        };                
                 
        let cmd: vscode.Command = {
            title: title,
            command: this._commandIds.initializeMemberFromCtor,
            arguments: [parameter]
        };

        return cmd;
    }

    private findConstructorBodyStart(document:vscode.TextDocument, position:vscode.Position) {
        for (var lineNo = position.line; lineNo < position.line+5; lineNo++) {
            var line = document.lineAt(lineNo);
            var braceIdx = line.text.indexOf('{');
            if(braceIdx !== -1){
                return new vscode.Position(lineNo+1,0);
            }            
        }
        return null;        
    }
    
    private findConstructorStart(document:vscode.TextDocument, position:vscode.Position): vscode.Position {
        var clazz = this.findClassFromLine(document, position.line)!;
        
        for (var lineNo = position.line; lineNo > position.line-5; lineNo--) {
            var line = document.lineAt(lineNo);
            if(line.isEmptyOrWhitespace && !(line.lineNumber < clazz.startLine)) {
                return new vscode.Position(lineNo, 0);
            }
        }
        
        return new vscode.Position(position.line, 0);
    }
}

enum MemberGenerationType {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Property,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    ReadonlyProperty,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    PrivateField
}

interface MemberGenerationProperties {
    type: MemberGenerationType,
    assignment: string,
    declaration: string
}

interface CSharpClassDefinition {
    startLine: number,
    endLine: number,
    className: string,
    modifier: string,
    statement: string
}

interface CSharpPropertyDefinition {
    class: CSharpClassDefinition,
    modifier: string,
    type: string,
    name: string,
    statement: string,
    lineNumber: number            
}

interface ConstructorFromPropertiesArgument {
    document: vscode.TextDocument,    
    classDefinition: CSharpClassDefinition,
    properties: CSharpPropertyDefinition[]
}

interface InitializeFieldFromConstructor {
    document: vscode.TextDocument,    
    type:string,
    name: string,
    memberGeneration: MemberGenerationProperties,    
    constructorBodyStart: vscode.Position | null,
    constructorStart: vscode.Position,    
}