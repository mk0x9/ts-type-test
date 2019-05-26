// based on dtslint/src/rules/expectRules.ts

import ts from 'typescript';

type ts = typeof ts;

interface Assertions {
    /** Lines with an $ExpectError. */
    readonly errorLines: ReadonlySet<number>;
    /** Map from a line number to the expected type at that line. */
    readonly typeAssertions: Map<number, string>;
    /** Lines with more than one assertion (these are errors). */
    readonly duplicates: ReadonlyArray<number>;
}

export function parseAssertions(sourceFile: ts.SourceFile): Assertions {
    const errorLines = new Set<number>();
    const typeAssertions = new Map<number, string>();
    const duplicates: number[] = [];

    const { text } = sourceFile;
    const commentRegexp = /\/\/(.*)/g;
    const lineStarts = sourceFile.getLineStarts();
    let curLine = 0;

    while (true) {
        const commentMatch = commentRegexp.exec(text);
        if (commentMatch === null) {
            break;
        }
        // Match on the contents of that comment so we do nothing in a commented-out assertion,
        // i.e. `// foo; // $ExpectType number`
        const match = /^ \$Expect((Type (.*))|Error)$/.exec(commentMatch[1]);
        if (match === null) {
            continue;
        }
        const line = getLine(commentMatch.index);
        if (match[1] === 'Error') {
            if (errorLines.has(line)) {
                duplicates.push(line);
            }
            errorLines.add(line);
        } else {
            const expectedType = match[3];
            // Don't bother with the assertion if there are 2 assertions on 1 line. Just fail for the duplicate.
            if (typeAssertions.delete(line)) {
                duplicates.push(line);
            } else {
                typeAssertions.set(line, expectedType);
            }
        }
    }

    return { errorLines, typeAssertions, duplicates };

    function getLine(pos: number): number {
        // advance curLine to be the line preceding 'pos'
        while (lineStarts[curLine + 1] <= pos) {
            curLine++;
        }
        // If this is the first token on the line, it applies to the next line.
        // Otherwise, it applies to the text to the left of it.
        return isFirstOnLine(text, lineStarts[curLine], pos) ? curLine + 1 : curLine;
    }
}

function isFirstOnLine(text: string, lineStart: number, pos: number): boolean {
    for (let i = lineStart; i < pos; i++) {
        if (text[i] !== ' ') {
            return false;
        }
    }
    return true;
}

interface ExpectTypeFailures {
    /** Lines with an $ExpectType, but a different type was there. */
    readonly unmetExpectations: ReadonlyArray<{ node: ts.Node; expected: string; actual: string }>;
    /** Lines with an $ExpectType, but no node could be found. */
    readonly unusedAssertions: Iterable<number>;
}

function matchReadonlyArray(actual: string, expected: string) {
    if (!(/\breadonly\b/.test(actual) && /\bReadonlyArray\b/.test(expected))) return false;
    const readonlyArrayRegExp = /\bReadonlyArray</y;
    const readonlyModifierRegExp = /\breadonly /y;

    // A<ReadonlyArray<B<ReadonlyArray<C>>>>
    // A<readonly B<readonly C[]>[]>

    let expectedPos = 0;
    let actualPos = 0;
    let depth = 0;
    while (expectedPos < expected.length && actualPos < actual.length) {
        const expectedChar = expected.charAt(expectedPos);
        const actualChar = actual.charAt(actualPos);
        if (expectedChar === actualChar) {
            expectedPos++;
            actualPos++;
            continue;
        }

        // check for end of readonly array
        if (
            depth > 0 &&
            expectedChar === '>' &&
            actualChar === '[' &&
            actualPos < actual.length - 1 &&
            actual.charAt(actualPos + 1) === ']'
        ) {
            depth--;
            expectedPos++;
            actualPos += 2;
            continue;
        }

        // check for start of readonly array
        readonlyArrayRegExp.lastIndex = expectedPos;
        readonlyModifierRegExp.lastIndex = actualPos;
        if (readonlyArrayRegExp.test(expected) && readonlyModifierRegExp.test(actual)) {
            depth++;
            expectedPos += 14; // "ReadonlyArray<".length;
            actualPos += 9; // "readonly ".length;
            continue;
        }

        return false;
    }

    return true;
}

export function getExpectTypeFailures(
    sourceFile: ts.SourceFile,
    typeAssertions: Map<number, string>,
    checker: ts.TypeChecker
): ExpectTypeFailures {
    const unmetExpectations: Array<{ node: ts.Node; expected: string; actual: string }> = [];
    // Match assertions to the first node that appears on the line they apply to.
    // `forEachChild` isn't available as a method in older TypeScript versions, so must use `ts.forEachChild` instead.
    ts.forEachChild(sourceFile, function iterate(node) {
        const line = lineOfPosition(node.getStart(sourceFile), sourceFile);
        const expected = typeAssertions.get(line);
        if (expected !== undefined) {
            // https://github.com/Microsoft/TypeScript/issues/14077
            if (node.kind === ts.SyntaxKind.ExpressionStatement) {
                node = (node as ts.ExpressionStatement).expression;
            }

            const type = checker.getTypeAtLocation(getNodeForExpectType(node));

            const actual = type
                ? checker.typeToString(type, /*enclosingDeclaration*/ undefined, ts.TypeFormatFlags.NoTruncation)
                : '';

            if (actual !== expected && !matchReadonlyArray(actual, expected)) {
                unmetExpectations.push({ node, expected, actual });
            }

            typeAssertions.delete(line);
        }

        ts.forEachChild(node, iterate);
    });
    return { unmetExpectations, unusedAssertions: typeAssertions.keys() };
}

function getNodeForExpectType(node: ts.Node): ts.Node {
    if (node.kind === ts.SyntaxKind.VariableStatement) {
        // ts2.0 doesn't have `isVariableStatement`
        const {
            declarationList: { declarations }
        } = node as ts.VariableStatement;
        if (declarations.length === 1) {
            const { initializer } = declarations[0];
            if (initializer) {
                return initializer;
            }
        }
    }
    return node;
}

function lineOfPosition(pos: number, sourceFile: ts.SourceFile): number {
    return sourceFile.getLineAndCharacterOfPosition(pos).line;
}
