// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import CodeActionProvider from './codeActionProvider';
// const parentfinder = require('find-parent-dir');
// const findupglob = require('find-up-glob');

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	const documentSelector: vscode.DocumentSelector = {
		language: 'typescript',
		scheme: 'file'
	};
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	// console.log('Congratulations, your extension "reactextension" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	// let disposable = vscode.commands.registerCommand('reactextension.helloWorld', () => {
	// 	// The code you place here will be executed every time your command is executed

	// 	// Display a message box to the user
	// 	vscode.window.showInformationMessage('Hello World from ReactExtension!');
	// });

	context.subscriptions.push(vscode.commands.registerCommand('reactextension.createComponent', createComponent));

	const codeActionProvider = new CodeActionProvider();
	let disposable = vscode.languages.registerCodeActionsProvider(documentSelector, codeActionProvider);
	context.subscriptions.push(disposable);
}

const createComponent = (args: any) => {
	promptAndSave(args, 'component');
};

const promptAndSave = (args: any, templatetype: string) => {
	if (args === null) {
		args = {_fsPath: vscode.workspace.rootPath };
	}

	let incomingPath: string = args._fsPath;
	
	// Ask for component name
	vscode.window.showInputBox({ 
		ignoreFocusOut: true,
		prompt: 'Please enter component name',
		value: `new ${templatetype}`
	}).then(componentName => {
		if (typeof componentName === 'undefined') {
			return;
		}

		// Capitalize first letter
		componentName = capitalizeFirstLetter(componentName);

		// Check if component already exists
		let componentPath = incomingPath + path.sep + componentName;
		if (fs.existsSync(componentPath)) {
			vscode.window.showErrorMessage('Component already exists');

			return;
		}

		// Create Folder
		fs.mkdirSync(componentPath);

		// Create files
		createFiles(componentPath, componentName);
	});
};

const capitalizeFirstLetter = (componentName: string) => {
	return componentName[0].toUpperCase() + componentName.slice(1);
};

const createFiles = (componentPath: string, componentName: string) => {
	createFile('style.tmpl', componentName, `${componentName}.module.css`, componentPath);
	createFile('component.tmpl', componentName, `${componentName}.tsx`, componentPath);
	createFile('package.tmpl', componentName, 'package.json', componentPath);
};

const createFile = (template: string, componentName: string, filename: string, originalfilepath: string) => {
	vscode.workspace.openTextDocument(vscode.extensions.getExtension('Edixon-vanVliet.reactextension')?.extensionPath + '/templates/' + template)
	.then((doc: vscode.TextDocument) => {
		let text = doc.getText();
		text = text.replace(/\${componentName}/g, componentName);
		fs.writeFileSync(originalfilepath + path.sep + filename, text);
	});
};

// this method is called when your extension is deactivated
export function deactivate() {}
