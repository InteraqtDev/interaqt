import { createToken, Lexer, TokenType, CstParser } from "chevrotain";


enum TokenName {
    And = "And",
    Or = "Or",
    Not = "Not",
    LParen = "LParen",
    RParen = "RParen",
    WhiteSpace = "WhiteSpace",
    AttrLiteral = "AttrLiteral",
}

const And = createToken({
    name: TokenName.And,
    pattern: /&&/,
});

const Or = createToken({
    name: TokenName.Or,
    pattern: /\|\|/,
});

const Not = createToken({
    name: TokenName.Not,
    pattern: /!/,
});

const LParen = createToken({
    name: TokenName.LParen,
    pattern: /\(/,
});
const RParen = createToken({
    name: TokenName.RParen,
    pattern: /\)/,
});
const WhiteSpace = createToken({
    name: TokenName.WhiteSpace,
    pattern: /\s+/,
    group: Lexer.SKIPPED,
});

const AttrLiteral = createToken({
    name: TokenName.AttrLiteral,
    pattern: /[\w\d_]+/
})

const tokensByPriority = [
    WhiteSpace,
    Or,
    And,
    Not,
    LParen,
    RParen,
    AttrLiteral
];

export const AttrLexer = new Lexer(tokensByPriority, {
    ensureOptimizations: true,
});
export type TokenTypeDict = { [key in TokenName]: TokenType };
export const tokens: TokenTypeDict = tokensByPriority.reduce(
    (acc, tokenType) => {
        acc[tokenType.name] = tokenType;
        return acc;
    },
    {} as TokenTypeDict
);



export class AttrParser_ extends CstParser {
    constructor() {
        super(tokens, {
            maxLookahead: 1,
        });
        this.performSelfAnalysis();
    }
    expression = this.RULE("expression", () => {
        this.OR([
            { ALT: () => this.SUBRULE(this.notExpression) },
            { ALT: () => this.SUBRULE(this.atomicExpression) },
        ]);
        this.MANY(() => {
            this.OR1([
                { ALT: () => this.SUBRULE1(this.orExpression) },
                { ALT: () => this.SUBRULE1(this.andExpression) },
            ])
        })
    });
    orExpression = this.RULE("orExpression", () => {
        this.CONSUME(tokens.Or);
        this.AT_LEAST_ONE(() => {
            this.SUBRULE(this.expression)
        })
    });
    andExpression = this.RULE("andExpression", () => {
        this.CONSUME(tokens.And);
        this.OR([
            { ALT: () => this.SUBRULE(this.notExpression) },
            { ALT: () => this.SUBRULE(this.atomicExpression) },
        ]);
    });
    atomicExpression = this.RULE("atomicExpression", () => {
        this.OR([
            { ALT: () => this.SUBRULE(this.parenthesisExpression) },
            { ALT: () => this.CONSUME(tokens.AttrLiteral) },
        ]);
    });
    parenthesisExpression = this.RULE("parenthesisExpression", () => {
        this.CONSUME(tokens.LParen);
        this.SUBRULE(this.expression);
        this.CONSUME(tokens.RParen);
    });
    notExpression = this.RULE("notExpression", () => {
        this.CONSUME(tokens.Not);
        this.SUBRULE(this.atomicExpression);
    });
}

export const parser = new AttrParser_();


function compress(cst: object) {
    const result = {}

    return result
}

export function parse(text) {
    const lexingResult = AttrLexer.tokenize(text);
    parser.input = lexingResult.tokens;
    const cst = parser.expression();

    debugger
    if (parser.errors.length > 0) {
        throw new Error("sad sad panda, Parsing errors detected");
    }


    return compress(cst)
}

