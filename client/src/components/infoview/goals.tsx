/* Mostly copied from https://github.com/leanprover/vscode-lean4/blob/master/lean4-infoview/src/infoview/goals.tsx */

import * as React from 'react'
import { InteractiveCode } from '../../../../node_modules/lean4-infoview/src/infoview/interactiveCode'
import { InteractiveGoal, InteractiveGoals, InteractiveHypothesisBundle, InteractiveHypothesisBundle_nonAnonymousNames, MVarId, TaggedText_stripTags } from '@leanprover/infoview-api'
import { WithTooltipOnHover } from '../../../../node_modules/lean4-infoview/src/infoview/tooltips';
import { EditorContext } from '../../../../node_modules/lean4-infoview/src/infoview/contexts';
import { Locations, LocationsContext, SelectableLocation } from '../../../../node_modules/lean4-infoview/src/infoview/goalLocation';
import { GameInteractiveGoal, GameInteractiveGoals } from './rpcApi';

/** Returns true if `h` is inaccessible according to Lean's default name rendering. */
function isInaccessibleName(h: string): boolean {
    return h.indexOf('✝') >= 0;
}

function goalToString(g: GameInteractiveGoal): string {
    let ret = ''

    if (g.goal.userName) {
        ret += `case ${g.goal.userName}\n`
    }

    for (const h of g.goal.hyps) {
        const names = InteractiveHypothesisBundle_nonAnonymousNames(h).join(' ')
        ret += `${names} : ${TaggedText_stripTags(h.type)}`
        if (h.val) {
            ret += ` := ${TaggedText_stripTags(h.val)}`
        }
        ret += '\n'
    }

    ret += `⊢ ${TaggedText_stripTags(g.goal.type)}`

    return ret
}

export function goalsToString(goals: GameInteractiveGoals): string {
    return goals.goals.map(goalToString).join('\n\n')
}

interface GoalFilterState {
    /** If true reverse the list of hypotheses, if false present the order received from LSP. */
    reverse: boolean,
    /** If true show hypotheses that have isType=True, otherwise hide them. */
    showType: boolean,
    /** If true show hypotheses that have isInstance=True, otherwise hide them. */
    showInstance: boolean,
    /** If true show hypotheses that contain a dagger in the name, otherwise hide them. */
    showHiddenAssumption: boolean
    /** If true show the bodies of let-values, otherwise hide them. */
    showLetValue: boolean;
}

function getFilteredHypotheses(hyps: InteractiveHypothesisBundle[], filter: GoalFilterState): InteractiveHypothesisBundle[] {
    return hyps.reduce((acc: InteractiveHypothesisBundle[], h) => {
        if (h.isInstance && !filter.showInstance) return acc
        if (h.isType && !filter.showType) return acc
        const names = filter.showHiddenAssumption ? h.names : h.names.filter(n => !isInaccessibleName(n))
        const hNew: InteractiveHypothesisBundle = filter.showLetValue ? { ...h, names } : { ...h, names, val: undefined }
        if (names.length !== 0) acc.push(hNew)
        return acc
    }, [])
}

interface HypProps {
    hyp: InteractiveHypothesisBundle
    mvarId?: MVarId
}

function Hyp({ hyp: h, mvarId }: HypProps) {
    const locs = React.useContext(LocationsContext)

    const namecls: string = 'mr1 ' +
        (h.isInserted ? 'inserted-text ' : '') +
        (h.isRemoved ? 'removed-text ' : '')

    const names = InteractiveHypothesisBundle_nonAnonymousNames(h).map((n, i) =>
        <span className={namecls + (isInaccessibleName(n) ? 'goal-inaccessible ' : '')} key={i}>
            <SelectableLocation
                locs={locs}
                loc={mvarId && h.fvarIds && h.fvarIds.length > i ?
                    { mvarId, loc: { hyp: h.fvarIds[i] }} :
                    undefined
                }
                alwaysHighlight={false}
            >{n}</SelectableLocation>
        </span>)

    const typeLocs: Locations | undefined = React.useMemo(() =>
        locs && mvarId && h.fvarIds && h.fvarIds.length > 0 ?
            { ...locs, subexprTemplate: { mvarId, loc: { hypType: [h.fvarIds[0], ''] }}} :
            undefined,
        [locs, mvarId, h.fvarIds])

    const valLocs: Locations | undefined = React.useMemo(() =>
        h.val && locs && mvarId && h.fvarIds && h.fvarIds.length > 0 ?
            { ...locs, subexprTemplate: { mvarId, loc: { hypValue: [h.fvarIds[0], ''] }}} :
            undefined,
        [h.val, locs, mvarId, h.fvarIds])

    return <div>
        <strong className="goal-hyp">{names}</strong>
        :&nbsp;
        <LocationsContext.Provider value={typeLocs}>
            <InteractiveCode fmt={h.type} />
        </LocationsContext.Provider>
        {h.val &&
            <LocationsContext.Provider value={valLocs}>
                &nbsp;:=&nbsp;<InteractiveCode fmt={h.val} />
            </LocationsContext.Provider>}
    </div>
}

interface GoalProps {
    goal: GameInteractiveGoal
    filter: GoalFilterState
}

/**
 * Displays the hypotheses, target type and optional case label of a goal according to the
 * provided `filter`. */
export const Goal = React.memo((props: GoalProps) => {
    const { goal, filter } = props

    const prefix = goal.goal.goalPrefix ?? 'Prove: '
    const filteredList = getFilteredHypotheses(goal.goal.hyps, filter);
    const hyps = filter.reverse ? filteredList.slice().reverse() : filteredList;
    const locs = React.useContext(LocationsContext)
    const goalLocs = React.useMemo(() =>
        locs && goal.goal.mvarId ?
            { ...locs, subexprTemplate: { mvarId: goal.goal.mvarId, loc: { target: '' }}} :
            undefined,
        [locs, goal.goal.mvarId])
    const goalLi = <div key={'goal'}>
        <strong className="goal-vdash">Prove: </strong>
        <LocationsContext.Provider value={goalLocs}>
            <InteractiveCode fmt={goal.goal.type} />
        </LocationsContext.Provider>
    </div>

    let cn = 'font-code tl pre-wrap bl bw1 pl1 b--transparent '
    if (props.goal.goal.isInserted) cn += 'b--inserted '
    if (props.goal.goal.isRemoved) cn += 'b--removed '

    // TODO: make this prettier
    const hints = goal.hints.map((m) => <div>{m.text}</div>)

    if (goal.goal.userName) {
        return <details open className={cn}>
            <summary className='mv1 pointer'>
                <strong className="goal-case">case </strong>{goal.goal.userName}
            </summary>
            {filter.reverse && goalLi}
            {hyps.map((h, i) => <Hyp hyp={h} mvarId={goal.goal.mvarId} key={i} />)}
            {!filter.reverse && goalLi}
            {hints}
        </details>
    } else return <div className={cn}>
        {filter.reverse && goalLi}
        {hyps.map((h, i) => <Hyp hyp={h} mvarId={goal.goal.mvarId} key={i} />)}
        {!filter.reverse && goalLi}
        {hints}
    </div>
})

interface GoalsProps {
    goals: GameInteractiveGoals
    filter: GoalFilterState
}

export function Goals({ goals, filter }: GoalsProps) {
    if (goals.goals.length === 0) {
        return <>No goals</>
    } else {
        return <>
            {goals.goals.map((g, i) => <Goal key={i} goal={g} filter={filter} />)}
        </>
    }
}

interface FilteredGoalsProps {
    /** Components to render in the header. */
    headerChildren: React.ReactNode
    /**
     * When this is `undefined`, the component will not appear at all but will remember its state
     * by virtue of still being mounted in the React tree. When it does appear again, the filter
     * settings and collapsed state will be as before. */
    goals?: GameInteractiveGoals
}

/**
 * Display goals together with a header containing the provided children as well as buttons
 * to control how the goals are displayed.
 */
export const FilteredGoals = React.memo(({ headerChildren, goals }: FilteredGoalsProps) => {
    const ec = React.useContext(EditorContext)

    const copyToCommentButton =
        <a className="link pointer mh2 dim codicon codicon-quote"
            data-id="copy-goal-to-comment"
            onClick={e => {
                e.preventDefault();
                if (goals) void ec.copyToComment(goalsToString(goals))
            }}
            title="copy state to comment" />

    const [goalFilters, setGoalFilters] = React.useState<GoalFilterState>(
        { reverse: false, showType: true, showInstance: true, showHiddenAssumption: true, showLetValue: true });

    const sortClasses = 'link pointer mh2 dim codicon ' + (goalFilters.reverse ? 'codicon-arrow-up ' : 'codicon-arrow-down ');
    const sortButton =
        <a className={sortClasses} title="reverse list"
            onClick={_ => setGoalFilters(s => ({ ...s, reverse: !s.reverse }))} />

    const mkFilterButton = (filterFn: React.SetStateAction<GoalFilterState>, filledFn: (_: GoalFilterState) => boolean, name: string) =>
        <a className='link pointer tooltip-menu-content' onClick={_ => { setGoalFilters(filterFn) }}>
            <span className={'tooltip-menu-icon codicon ' + (filledFn(goalFilters) ? 'codicon-check ' : 'codicon-blank ')}>&nbsp;</span>
            <span className='tooltip-menu-text '>{name}</span>
        </a>
    const filterMenu = <span>
        {mkFilterButton(s => ({ ...s, showType: !s.showType }), gf => gf.showType, 'types')}
        <br/>
        {mkFilterButton(s => ({ ...s, showInstance: !s.showInstance }), gf => gf.showInstance, 'instances')}
        <br/>
        {mkFilterButton(s => ({ ...s, showHiddenAssumption: !s.showHiddenAssumption }), gf => gf.showHiddenAssumption, 'hidden assumptions')}
        <br/>
        {mkFilterButton(s => ({ ...s, showLetValue: !s.showLetValue }), gf => gf.showLetValue, 'let-values')}
    </span>

    const isFiltered = !goalFilters.showInstance || !goalFilters.showType || !goalFilters.showHiddenAssumption || !goalFilters.showLetValue
    const filterButton =
        <WithTooltipOnHover mkTooltipContent={() => filterMenu}>
            <a className={'link pointer mh2 dim codicon ' + (isFiltered ? 'codicon-filter-filled ': 'codicon-filter ')}/>
        </WithTooltipOnHover>

    return <div style={{display: goals !== undefined ? 'block' : 'none'}}>
        <details open>
            <summary className='mv2 pointer'>
                {headerChildren}
                <span className='fr'>{copyToCommentButton}{sortButton}{filterButton}</span>
            </summary>
            <div className='ml1'>
                {goals && <Goals goals={goals} filter={goalFilters}></Goals>}
            </div>
        </details>
    </div>
})