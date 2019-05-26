import ts from 'typescript';

export function getProgram(): ts.Program {
    // https://stackoverflow.com/a/53898219
    const parseConfigHost: ts.ParseConfigHost = {
        fileExists: ts.sys.fileExists,
        readFile: ts.sys.readFile,
        readDirectory: ts.sys.readDirectory,
        useCaseSensitiveFileNames: true
    };
    const configFileName = ts.findConfigFile('./', ts.sys.fileExists, 'tsconfig.json');

    if (!configFileName) {
        throw new Error("Can't find tsconfig.json!");
    }

    const configFile = ts.readConfigFile(configFileName, ts.sys.readFile);
    const parsedCommandLine = ts.parseJsonConfigFileContent(configFile.config, parseConfigHost, './');
    const program = ts.createProgram(parsedCommandLine.fileNames, parsedCommandLine.options);

    return program;
}
