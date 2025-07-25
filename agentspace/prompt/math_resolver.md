# Math Resolver

## Prompt
我需要一个非常小的数学求解工具，你来帮我实现。要求：
1. 写在 src/runtime/computationHandles 目录下，实现的所有代码尽量放在一个文件中。
2. 表达式(Expression)支持最基本的 加/减/乘/除/乘方/开方 即可，支持对象形式的链式操作，每一次链式调用都是生成新对象。
3. 可以在表达式中声明变量，当用户传入变量值(evaluate)时就能得到表达式的值。
4. 表达式可以通过 gt/lt/eq 来变成不等式/等式。不等式/等式，也支持传入变量后算出是否成立的 bool 值。注意，等式和不等式两边都可以是表达式，即 gt/lt/eq 方法的参数可以就是数字也可以是另一个表达式。
5. 不等式/等式 还要支持"求解" 的功能，因为我们一定保证式子中只有一个变量（变量需要有唯一 id，它可以同时出现在式子的左右两边），式子中的变量即使在两边出现，并且有次方的话，次方也是相同的，可以合并。所以我们的求解只要先合并变量，再不断做逆运算即可。
6. 写完之后要对所有操作写测试用例。并保证测试用例通过，用例写在 tests/runtime 下，用 npm run test:runtime 执行测试。


