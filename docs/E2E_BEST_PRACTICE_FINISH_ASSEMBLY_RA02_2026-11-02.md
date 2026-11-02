# RA-02①② 新合成assembly・private fixture pinの合成検証

Date: 2026-11-02 / Baseline: `5ca638a` / Status: 合成依存限定・証拠発行なし。

[RD-A draft-0.4](BEST_PRACTICE_ABORT_SCOPE_FINISH_CONTEXT_RDA_DESIGN.md)§10の生成準備境界だけを対象とする。`tests/support/review/synthetic-finish-assembly.ts`と専用試験を追加し、梱包監査・CHANGELOG・設計書を更新した。runtime source、旧`createSyntheticSoftRecoveryIssuer`、既存試験は変更していない。

## 実装・責務

- factoryは新しい診断shellを作るだけで、外部データはbind保護区間まで読まない。別brandのbindingと合成run／session／source等の参照を内部生成し、既存ownerを後から登録しない。
- strictな6項目seedと各inputをboundedにcopyし、RA-01の集合／UTC／header／variant検査へ渡す。pin済みheader・selected・time、receipt別期待context、合成の元受理stateはclosure内だけに保持する。
- receiptとimmutableなreviewed fixture pinは内部生成する。callerのreceipt／結果参照／summary／readyを登録する口はない。omittedの起源は同ledgerから導出し、callerのreviewed_origin申告を拒否する。
- bind／prepareのclaimは最初の外部guardより前に消費。guardはpre／postで同じbusy／hardを使い、依存が再入失敗をcatchしても復活させない。混入・重複・取消・期限切れでprivate参照を破棄し、最初の診断を保持する。
- inspectは固定状態・件数・hard code／stageだけ。証拠・header・ID／UTC・release・receiptを返さず、evidence_issues=0、route_bound=falseを維持する。prepareは証拠も候補も返さない。

seed全体で深さ8・object項目30・配列100・訪問10,000・保守的文字費262144を共有する。非opaqueのaliasは出現ごとに数える。組み立て後のRA-01 projectionも同上限へ独立検査するが、二つの局所検査を単一実予算の課金や全体work／allocation上界の証明とはしない。

## 検証結果

| 確認 | 結果 |
|---|---|
| RA-02①②専用合成試験 | 86件成功 |
| 関連12ファイル（追加84件時点の中間確認） | 1,369件成功、失敗・保留0。最終86件を含む保証は下記全体回帰 |
| 最終全体合成回帰 | 247ファイル、11,550件成功、失敗・保留0、約32.4秒 |
| build | `npm run build`成功 |
| strict型検査 | 新規helper／試験をstrict・noUnusedLocals・noUnusedParametersで検査し成功 |
| ESLint | 新規helper／試験・梱包監査の3ファイルで成功 |
| 梱包監査 | `node tests/review/package-http-classification.mjs`成功、441配布ファイル。path／関数／brand／scopeの非同梱と旧root／I/O／clock／worker混入の負の対照を確認 |

全体回帰は既存のローカル待受試験が動作できる実行条件で、maxWorkers=3と既存期限を維持した。150秒の外側観測停止は発動していない。途中の84件版（全体11,548件）と85件版（同11,549件）も成功したが、最終の根拠は86件を含む11,550件の再実行とする。

主な試験：別assembly／copy／旧issuer bindingの拒否と他owner不変、旧issuerのobserve→claim→consume維持、二重bind／prepare・再入・失敗後再開の拒否、pin後の元データ変更、strict不足／余剰key、reviewed descriptorとinputのID／T_i混入、期待context不足、omission起源、pre／post guard取消、最初のhard理由保持、revoke／data-only closeの破棄、getter／Proxy／循環／symbol／疎配列・総量超過の拒否を確認した。

文字費の独立対照では、各warningが200文字以下、各配列が100件以下の複数inputを用意し、実装helperを呼ばない再帰計算でseed合計が262144 unitを超えることを確認した。1 recordごとの枠リセットでは拒否できない入力を停止させる。

## 初回失敗と修正

1. 新規module未存在のREDを確認してから、独立assemblyとprivate pinの最小経路を実装した。
2. strict型検査で、先行条件によりnullへ絞られたhardをcatch内で参照したため`never.code`エラーになった。最初の診断はfail内部の`??=`が保持しているので、catchの冗長なhard参照を除いた。最終型検査は成功。
3. 最初のguardで取消された場合にclaim開始flagがfalseのままだったことを追加REDで確認。claimをguardより前に移して、失敗時も消費済みとする契約へ揃えた。成功・拒否・再入を再検証した。
4. 梱包監査の旧root混入の負の対照が、未使用importのためTypeScript変換時に消え、期待した拒否にならず監査が失敗した。importした関数への参照を含める対照に訂正し、監査が確実に検出することを再確認した。実helperに旧root依存は追加していない。

## 未対応・非実施

これは新assemblyの準備層であり、元SC2-D owner／handoffと共通guardへの接続はまだない。fixture descriptorから作ったimmutable pinは、元analyze post-guardの受理済み結果・full wire検証の証拠ではない。元active receipt・集合／limitations／consistencyの由来と元受理captureは未接続。

RA-01値検査用のplan／frame／ready／lifecycle placeholderは局所scaffoldingとして破棄し、生存slotに保管しない。SourceLifecycleSlot・NewFrameRouteSlot・FinishContextIssueSlot、証拠発行、RA-03の原子的受理、finish／E・正常source／worker cleanup能力は未実装。data-only closeも実cleanupの成功ではない。

exact layout／allocation・列挙の確保・全体work上界・本番capはUnknown。正式発行口閉鎖・全体受付無効・VM／監視／telemetry調査保留を維持し、証拠発行・実接続・実通信・実機操作・設定変更は実施していない。
