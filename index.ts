import { getProgram } from './compiler';
import { parseAssertions, getExpectTypeFailures } from './type-check';
import ts from 'typescript';

const program = getProgram();
const sourceFiles = program
    .getSourceFiles()
    .filter(sourceFile => !sourceFile.isDeclarationFile || /\$ExpectType/.test(sourceFile.text));
const checker = program.getTypeChecker();

for (const sourceFile of sourceFiles) {
    const { typeAssertions } = parseAssertions(sourceFile);

    if (typeAssertions.size > 0) {
        const { unmetExpectations, unusedAssertions } = getExpectTypeFailures(sourceFile, typeAssertions, checker);

        unmetExpectations.forEach(unmet => {
            console.log(`expected: ${unmet.expected}, got instead: ${unmet.actual}`);
            console.log(printNode(sourceFile, unmet.node));
        });
        console.log(sourceFile.fileName);
    }
}

function printNode(sourceFile: ts.SourceFile, node: ts.Node) {
    return sourceFile.text.slice(node.pos, node.end);
}
