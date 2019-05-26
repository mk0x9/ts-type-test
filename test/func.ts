export default function func(a: number, b: number): number {
    // test

    // $ExpectType any[]
    const result = a + b;

    return result;
}

// $ExpectType string
const a = 1;
