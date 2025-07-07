/* @jsx createElement */
import {atom, computed, RenderContext, RxList} from 'axii'
export function App({}, { createElement }: RenderContext) {

    const name = atom('')
    const greeting = computed(() => `hello ${name()}`)

    const newItem = atom('')
    const newScore = atom(0)

    const onAdd = () => {
        list.unshift({
            name: newItem(),
            score: newScore()
        })
        newItem('')
        newScore(0)
    }

    const list = new RxList([{
        name:'swimming',
        score: 100,
    }])

    const mappedList = list.map((item) => {
        return {
            ...item,
            comment: item.score > 50 ? 'good' : 'bad'
        }
    })

    const total = list.reduceToAtom((acc, item) => {
        return acc + item.score
    }, 0)



    return <div>
        <div>
            <input placeholder={"enter name"} value={name} onInput={(e:any) => name(e.target.value)}/>
        </div>
        <div>{greeting}</div>

        <div>
            <input placeholder={"enter subject name"} value={newItem} onInput={(e:any)=>newItem(e.target.value)}/>
            <input placeholder={"enter subject score"} type='number' value={newScore} onInput={(e:any)=>newScore(parseInt(e.target.value, 10))}/>
            <button onClick={onAdd}>add</button>
        </div>
        <table>
            <thead>
                <tr>
                    <th>name</th>
                    <th>score</th>
                    <th>comment</th>
                </tr>
            </thead>
            <tbody>
                {mappedList.map(({name, score, comment}) => <tr>
                    <td>{name}</td>
                    <td>{score}</td>
                    <td>{comment}</td>
                </tr>)}
                <tr>
                    <td>total</td>
                    <td>{total}</td>
                    <td>{() => total() > 200 ? 'good job' : 'keep going'}</td>
                </tr>
            </tbody>

        </table>
    </div>
}