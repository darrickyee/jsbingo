import { types, Instance, cast } from 'mobx-state-tree';

/* ---- Utilities ---- */
const seq = (i: number) => [...Array(Math.round(i)).keys()];

const randInt = (upper: number) => Math.floor(Math.random() * upper);

const shuffleArray = arr => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = randInt(i + 1);
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

/* ---- Label List ---- */

const LabelList = types
    .model('Labels', {
        list: types.array(types.string),
        freeIndex: types.maybeNull(types.number),
    })
    .actions(self => ({
        add(text = '') {
            self.list.push(text);
        },
        delete(idx: number = null) {
            // Use 'cast' to avoid TypeScript errors
            if (idx) self.list = cast(self.list.filter((_, i) => i !== idx));
            else self.list.pop();
        },
        setFreeIndex(idx: number = null) {
            self.freeIndex = idx;
        },
    }))
    .views(self => ({
        get freeLabel() {
            return self.list[self.freeIndex];
        },
    }));

type LabelListType = Instance<typeof LabelList>;

/* ---- Square ---- */

const Square = types
    .model('Square', {
        checked: false,
        free: false,
        label: 'Default label',
        col: 0,
        row: 0,
    })
    .actions(self => ({
        check() {
            self.checked = !self.checked;
        },
    }));

type SquareType = Instance<typeof Square>;

/* ---- Board ---- */

const Board = types
    .model('Board', {
        squares: types.array(Square),
        size: 5,
    })
    .views(self => {
        function getDim(dim = 'row'): SquareType[][] {
            if (['row', 'column'].includes(dim))
                return seq(self.size).map(i => self.squares.filter(sq => sq[dim] == i));

            return [];
        }
        return {
            get rows() {
                return getDim();
            },
            get columns() {
                return getDim('column');
            },
            get diagonals() {
                return seq(2).map(i =>
                    self.squares.filter(s =>
                        i ? s.row === self.size - s.col - 1 : s.row === s.col
                    )
                );
            },
            get completed() {
                const {
                    rows,
                    columns,
                    diagonals,
                }: {
                    rows: SquareType[][];
                    columns: SquareType[][];
                    diagonals: SquareType[][];
                } = this;
                return (
                    self.squares.length &&
                    [...rows, ...columns, ...diagonals].some(s => s.every(square => square.checked))
                );
            },
        };
    });

type BoardType = Instance<typeof Board>;

/* ---- Build board ---- */

const buildBoard = (labels: LabelListType, size = 5, randomFree = false) => {
    if (size && labels.list.length) {
        const numdecks = Math.ceil(size ** 2 / labels.list.length);
        const boardlabels = seq(numdecks)
            .flatMap(() => shuffleArray(labels.list))
            .slice(0, size ** 2);
        const freeIndex = randomFree ? randInt(size ** 2) : Math.floor(size ** 2 / 2);

        return Board.create({
            squares: boardlabels.map((label, i) =>
                Square.create({
                    row: Math.floor(i / size),
                    col: i % size,
                    label: i === freeIndex ? labels.freeLabel : label,
                    free: i === freeIndex,
                    checked: i === freeIndex,
                })
            ),
            size,
        });
    }
};

export { buildBoard, BoardType, SquareType, LabelListType, Board, LabelList };