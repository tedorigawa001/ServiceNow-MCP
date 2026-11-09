# WF-B：Journal供給の先行shell／空保持slot合成検証

Date: 2026-11-09 / 実装前HEAD: `f51e246` / 未コミット検証。

親: [private供給・先行保持境界§10](BEST_PRACTICE_WFB_JOURNAL_ISSUER_SUPPLY_DESIGN.md)。正式発行口・C実行入口閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。

## 1 対象と保証の区別

新fixture `tests/review/fixtures/journal-supply-shell-fake.ts`だけに独立合成assemblyを追加した。既存issuer／start／Journal／transportをimportせず、内部型・34段階生成順・同合成owner／scope／epochへの一度限り結合を検証する。実RetirementStartAssemblyの生成点・同既存issuerへのbindingは未接続である。

FailureShellを生成処理より前に置き、各生成をnot_started／attempting／provisional／confirmedに分ける。source／packet／cellは生成せず、25cell保持slotは空。供給claimは未消費、final anchorは未発行。合成descriptor／scope／claimは外へ返さず、inspectは固定値のみとする。close・拒否でも捕捉済み参照と未確認attemptを保持し、cleanup／discard完了を報告しない。

## 2 実行結果

| 確認 | 結果 |
|---|---|
| 新規journal-supply-shell試験 | **154件成功** |
| 関連15ファイル回帰 | **747件成功・失敗0**、19:26:08、956ms |
| 新fixture／新試験のstrict型検査 | exit 0 |
| `bdo npm run build` | exit 0 |
| `compiled-journal-supply-shell.mjs` | exit 0、独立binding対照7・未捕捉start・反復拒否を確認 |
| `compiled-absence-journal.mjs` | exit 0、従来のbinding6／旧clear11／early・missing commit／stamp・stale fact対照を維持 |
| `compiled-capture-admission.mjs` | exit 0、従来binding22・root gate5を維持 |
| 梱包dry-run | 441ファイル、tests／新fixture混入0。一時cache使用、終了時削除 |

関連15ファイルはjournal-supply-shell、absence-journal、canonical-supply-transfer、capture-admission、canonical-supply-view、pending-binding、pending-construction、read-hash-capacity、read-hash-declared-actual、read-hash-kernel-extraction、read-hash-fake、retirement-start、snapshot-read-start、snapshot-read-composition、supply-boundaryの各`.test.ts`。全repository試験ではない。製品・試験の期限は変更していない。

strict検査:

```sh
bdo npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck tests/review/fixtures/journal-supply-shell-fake.ts tests/review/journal-supply-shell.test.ts
```

compiled対照は`bdo node tests/review/fixtures/compiled-journal-supply-shell.mjs`等で実行。scratchへ隔離compileし、finallyで削除する。梱包確認は`npm pack --dry-run --json --ignore-scripts --cache <一時directory>`の一覧だけを検査し、archive生成・依存導入・packaged worker実行は未実施。

## 3 独立oracle・故障prefix

- 34点×before／attempt／after／doneの136対照。期待stage配列、捕捉数、cell保持prefixを試験側で独立計算し、最初の故障位置と元参照保持、終端後の同じ結果を確認した。未捕捉を未生成扱いしない。
- C→F対応は試験側の固定25要素表で照合し、本体layoutから期待値をimportしない。空保持slotと実cell objectを区別する。
- descriptor同値copy、余剰field、variant、foreign start、scope copy／scope各field、epoch／packet混入をbinding前に拒否した。descriptor copy以外は不正descriptorを正規発行slotにも入れ、単なるcurrent／issued不一致による後段maskingを避けた。scope内field混入は正規scopeとの参照差で拒否し、実startのfield別検査を実証したとは扱わない。
- compiled対照7は各対象条件を外したときにbindings=1へ進むことを確認し、最終拒否だけでなく狙った結合段階を検証した。
- 同期再入はconstruction_in_progress、frame内closeはdeferred扱いから終了後closedへ固定し、合成start生成前に止める。二重prepare・失敗後・close後は新しい生成やclaim消費を行わない。
- 外部Proxy／関数を渡してもhookを呼ばず、任意登録・採用・消費の公開口を作っていない。raw例外は非出力。

## 4 初回結果・未対応

初回の新規試験154件と型検査は成功。コード確認で混入probeがcurrent側だけを変えると同参照検査で他条件がmaskされる点を見直し、上記の正規発行slot側probeへ調整した。compiled対照も初回成功。今回の実行では未解消の試験失敗やtimeoutは観測していないが、全体回帰・本番動作の保証にはしない。

先行FailureShell以前の実OOM、module layout／固定捕捉台帳の実確保失敗、診断必着、追加CPU／heap／layout・E／SはUnknown。構造34枠をwork上界として採用しない。B02の実start接続・B04以降・Journal封印／borrow・供給claim消費・final anchor発行・admission消費・packet生成・固定discard・証拠・root終端は未実施。旧試験と別assembly保証を混同しない。

実接続・実通信・設定変更・Pushは行わず、正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。今回分は未コミット。

## 5 コミット対象だけの隔離再検証（2026-11-09）

HEAD `f51e246`と今回の6ファイルだけをindexから一時directoryへ展開した。既存node_modulesだけを参照し、作業treeの他変更や既存distを使わず検証した。

- ビルドと新fixture／新試験のstrict型検査はexit 0。
- 同snapshotの関連15ファイル747件成功・失敗0（19:55:17、847ms）。全repository試験ではない。
- 新shell／既存AbsenceJournal／既存CaptureAdmissionの3つのcompiled scriptは全てexit 0。
- 一時cacheと一時出力先で`npm pack --json --ignore-scripts`を実行し、実archiveを生成した。manifest／`tar -tzf`で441ファイルを確認し、tests／新fixture混入0、server／worker entryあり。archiveと一時cacheは終了時に削除。依存導入・packaged worker実行・外部接続は行っていない。

本項はコミット前検証の記録であり、別assembly保証を既存issuerへの正式bindingへ昇格しない。各閉鎖条件・Unknown・調査保留、Pushなしを維持する。
