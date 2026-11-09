# WF-B：WriterGate／pin／grantの独立純粋fake検証

Date: 2026-11-09 / 実装前HEAD: `e1258c3` / 未コミット検証。

親: [WriterGate詳細設計§10](BEST_PRACTICE_WFB_WRITER_GATE_FRAME_DESIGN.md)。正式発行口・C実行入口閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。

## 1 変更対象と非接続境界

新fixture `writer-gate-fake.ts`、新試験 `writer-gate.test.ts`、新compiled対照 `compiled-writer-gate.mjs`を追加した。fixtureはimportなしの独立assemblyで、同fake ownerへのpin結合・一度限りのgrant・有限状態・再入／拒否・部分生成保持だけを扱う。既存composition／SS03／source／control／Journalは変更していない。

pin／grant／scopeの正規参照はprivate slotにだけ保持し、公開診断へ出さない。stop_requestedでも既にactiveな同grantの資格だけを認め、fake退出後の再利用を拒否する。故障後は未消費へ戻さず、捕捉済みpin／grantと未捕捉attemptの段階を保持する。先行producer理由をgate理由で上書きしない。

closed_fakeは純粋状態上のclosureで、実GateClosedRecordは未発行（closedEvidence=not_issued）。exitもfakeイベントであり、正規FrameExitRecord・実frame退出・実writer停止を保証しない。outcome_throw／outcome_cancel／prior_failureは固定ラベルで、実worker例外／取消／producer処理の試験ではない。

## 2 実行結果

| 確認 | 結果 |
|---|---|
| 新規writer-gate試験 | **43件成功** |
| 関連17ファイル回帰 | **964件成功・失敗0**（21:53:16、846ms）。全repository試験ではない |
| 新fixture／新試験のstrict TypeScript検査 | exit 0 |
| `bdo npm run build` | exit 0 |
| `compiled-writer-gate.mjs` | exit 0、pin11／grant9の計20単独identity変異、未捕捉grantの失敗保持 |
| `compiled-canonical-supply-construction.mjs` | exit 0、既存17binding対照維持。issuer unused／writer停止未接続 |
| npm pack dry-run | 441ファイル、新fixture／tests混入0。一時cacheは終了時削除 |

関連17ファイルはwriter-gate、canonical-supply-construction、journal-supply-shell、absence-journal、canonical-supply-transfer、capture-admission、canonical-supply-view、pending-binding、pending-construction、read-hash-capacity、read-hash-declared-actual、read-hash-kernel-extraction、read-hash-fake、retirement-start、snapshot-read-start、snapshot-read-composition、supply-boundaryの各`.test.ts`。期限は変更していない。

strict検査は`bdo npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck tests/review/fixtures/writer-gate-fake.ts tests/review/writer-gate.test.ts`。compiledは`bdo node tests/review/fixtures/compiled-writer-gate.mjs`でscratchへ隔離compileしfinallyで削除。梱包は`npm pack --dry-run --json --ignore-scripts --cache <一時directory>`の一覧だけを検査し、archive生成・依存導入・packaged worker実行は未実施。

## 3 独立対照・初回結果

- pin11／grant9のcopy・brand・余剰field・gate／owner／scope・epoch・frame／phase混入を、bind成功前／grant activation前の段階で拒否した。copy以外のfield対照は不正参照を正規issued slotにも置き、同参照guardだけで他field検査がmaskされるのを避けた。compiledでは各条件を外すと狙ったbind／enterが成功することを確認した。
- bind_before／mint／capture／post、enter_before、grant_mint／capture／post、exit_before／revoke／postの11故障点で、bind／grant試行数・捕捉有無・grant段階・frame段階・失敗位置を別表照合した。終端後の全操作が同じ固定結果を返し、診断と保持参照を変更しないことを確認した。
- bind／enter／request／exit／closeGateの長さ4の625操作列を独立イベントoracleで実行し、各段階のgate／frame／owner結合済み状態・stop・一度限り利用・先行理由を比較した。本体の状態表やcounterを期待値へimportしない。
- bind／enter／exitの同期再入、enter途中stop、未開始の停止とlocalなclosedモデル、producer／outcomeラベルの分離を確認した。Proxy／関数など入力hookは実行せず、任意登録口や操作callbackはない。
- 初回の新規43件、型検査、compiled20対照は全て成功した。関連17ファイルでも今回未解消の失敗／timeoutは観測していない。ただし全体回帰・本番動作・正規frame退出の保証へ昇格しない。

## 4 未実施・Unknown

正規startへのgate結合、実frame enter／exit、実leafとordinal、全WG01〜WG08のwriter停止、固定drain、実closed同期section、Journal終端metadata／封印／供給は未実装。realFrame=not_connected、realWriterCalls=0、closedEvidence=not_issued、admission消費0、packet生成0、証拠発行閉鎖、root終端未呼出しを維持する。

FailureShell／scope等の実確保以前のOOM、診断必着、escaped資格の不存在、追加CPU／heap／layout／guard／bootstrap実E/S、全writer coverageはUnknown。純粋fakeの有限状態を実work受付やresource cleanupの証拠に使わない。

CHANGELOG・親設計を更新。今回分は未コミットで、実接続・実通信・設定変更・Pushは行っていない。各閉鎖条件・全体受付無効・Unknown・調査保留を維持する。

## レビュー修正（2026-11-09）

レビュー基準HEAD: `dcb00e0`。修正前は全体323ファイル・16,211件成功。

指摘：
1. `fail()`が理由によらずgateを`unconfirmed`にしていた。設計§3の`unconfirmed`は「実行権限の退役を確認できない終端」である。probeでは、bind→enter→request→exitで退出を確認した（grant revoked・frame exited）後の重複`enter()`が`duplicate_grant`で拒否されつつgateも`unconfirmed`となり、以後`closeGate()`が同じ拒否を返し続けて閉鎖できなかった。frame前の入力拒否・pin不一致でもgateは`unconfirmed`だった。試験のoracleもこの挙動を期待値にしていた。
2. bind後の再照合6種（enter／check／exit／closeGateのpin・grant再照合、closeGateのrevoked条件、checkのgrantStage条件）は到達しない二重防御だった。

修正：
- `fail()`がgateを`unconfirmed`にするのは、operation_unconfirmedか、frameがentering／exitingの間の失敗だけとした。frame前の入力拒否・pin不一致はgate状態を保つ（pin混入試験の期待値は`unbound`）。
- 重複bind／重複enterは`refuse()`へ分け、gate／frame状態とfirstを変えずsticky診断`refusal`だけを残す。固定失敗結果にもしない。理由型から`duplicate_*`を外した。
- 有限event-word oracleを、重複要求が状態を変えないモデルへ直した。退出確認後の重複要求後も閉鎖できる試験と、入力拒否でgate状態を保つ試験を追加した。

RED：更新・追加した15件が修正前に失敗した（pin混入11件、主経路、oracle、追加2件）。GREEN：新規45件成功、compiled 20対照は維持。

一時変異（試験後に元へ戻した）：計17種、検出11、等価6。
- 修正前から検出6種：closeGateのbind／stop条件とframe状態、enterの停止gate、exitのrevoke、bindの停止gate、余分な引数。
- 今回検出5種：常にunconfirmedにする変異、entering中の失敗をunconfirmedにしない変異、重複grant／重複bindを固定失敗にする変異、refusal未記録。
- 等価6種：上記2の到達しない二重防御。

全体回帰：`npm run lint`・`npm run build`・`package-http-classification.mjs`成功、vitest全体323ファイル・16,213件成功。

## 5 コミット対象だけの隔離再検証（2026-11-09）

HEAD `e1258c3`と今回の6ファイルだけをindexから一時directoryへ展開した。既存node_modulesだけを参照し、作業treeの他変更や既存distを使用せず検証した。

- ビルドと新fixture／新試験のstrict型検査がexit 0。
- 関連17ファイル964件成功・失敗0（21:57:42、876ms）。全repository試験ではない。
- compiled-writer-gateのidentity20対照と失敗保持、compiled-canonical-supply-constructionの既存17対照がexit 0。
- 一時cache／出力先で`npm pack --json --ignore-scripts`を実行し実archiveを生成。manifestと`tar -tzf`の441件が一致し、tests／新fixture混入0、server／worker entryあり。archiveと一時cacheは削除。依存導入・packaged worker実行・外部接続は未実施。

本項はコミット前検証の記録であり、純粋fakeのclosed状態を実閉鎖証拠へ昇格しない。正規frame・実writer・Journal供給は未接続。各閉鎖条件・全体受付無効・Unknown・調査保留、Pushなしを維持する。
