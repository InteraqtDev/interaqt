import {atom, FixedCompatiblePropsType, PropsType, PropTypes, RenderContext, RxList} from "axii";

export const AdvancedProptype = {
    simpleProps: PropTypes.string.default(() => 'simple'),
    atomProp: PropTypes.atom<string>().default(() => atom('')),
    listProp: PropTypes.rxList<string>().default(() => new RxList(['a', 'b'])),
}

export function Advanced(props: FixedCompatiblePropsType<typeof AdvancedProptype>, {createElement}: RenderContext) {
    const {} = props as PropsType<typeof AdvancedProptype>
    return (
       <div></div>
    )
}

Advanced.propTypes = AdvancedProptype

