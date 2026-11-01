# WJ-C：通常finishのE／対象集合・保持U・終了候補の合成検証

Date: 2026-11-02 / 基準HEAD: `cadcad5`。
Status: **配布対象外の合成依存だけ。実worker／runtime・実sessionとは未接続。**

[詳細設計draft-0.7](BEST_PRACTICE_ABORT_SCOPE_WORKER_TIME_BINDING_DESIGN.md)§13、[上位接続契約draft-0.9](BEST_PRACTICE_ABORT_SCOPE_RELEASE_COMPARISON_TIME_BINDING_DESIGN.md)を参照。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。

## 1 実装と保証範囲

[既存合成owner](../tests/support/review/synthetic-worker-time.ts)へ、同generation／finish jobの発行・応答消費・固定終端候補の消費を追加した。WJ-Aの台帳をprivateに再利用し、runtimeのsession／source／worker／transport・登録口は共有／追加していない。WJ-A本体と既存157件／WJ-B 66件を維持した。

analyzeの受理後に同receipt・T_i・state／reasonを保持する。finishは元S／全L／保持Uのまま、送信前のheaderと最大100件の固定id集合をpinする。未完了input、受理済みinputの欠落、未受理reviewedや混入を拒否する。inputを作らない行は、fake issuerの送信前projectionから既存の非reviewed値契約で保持する。**この集合が実選択windowから来た証明は未実装**で、source由来保証へ昇格しない。

同finishのpendingをguard前に消費し、`S <= O <= U <= E <= S+L`、同header・同id集合を確認する。各reviewedは同receiptの正確なT_i／期待contextに一致する必要がある。Eは値入力で、再採取・clamp・残時間からのL再計算をしない。宣言deadline=60000とoperator設定の`expires_at > S+60000`は、実効Lとは別に維持する。

返却で許すstate変更は既存finalize同様のreviewed→result_omittedだけとし、response_limit／response_truncatedを要求する。追加・欠落・重複、非reviewedの昇格や理由変更は拒否する。rejected／omittedや親側の事前omissionでも元inputのUを下げない。不正なreviewedを送信前manifestへ入れてからomitで救済しない。

応答の全guard後は空の凍結candidate handleだけを返す。固定consumerはそれを先に一度消費し、同ownerの正常source close・generation close開始／confirmClosedを要求する。固定guardとWJ-A root closeが完了してから、authority:noneの限定summary（同E・集合件数のみ）を返す。失敗／取消で候補・claim・集合を失効し、先行固定診断と受理済みUTCデータだけを残す。正常終端ではUTC・identityも破棄する。

合成のclose状態は実OS終了・実session cleanupを証明しない。全aggregate JSONやfindingsを複製／再schema検証しておらず、今回のfixtureも**親が照合する必要fieldのprojection**で、full schemaに成功したworker応答の実行ではない。full schema／wire上限は既存workerの責務のまま。0.2／0.3の公開契約や既存production adapterは変更していない。

## 2 独立oracle・合成試験

[新規76件](../tests/review/synthetic-worker-finish.test.ts)を追加した。oracleは固定表・別計算の期待値で、予測のために実比較器を呼ばない。

| 観点 | 確認内容 |
|---|---|
| Eの境界 | 空200／0 inputのE=O、E<O、E=S+L、E=S+L+1、無効UTC。reviewed／rejected／omittedすべてE<Uを拒否。E=Uを許可 |
| 元deadline | 実効L=2000でもJSONの60000を期限延長に使わない。operator expiryはS+60000等号拒否・+1ms許可 |
| header | schema／S／Update Set／instance binding／target_version／release／rule集合／必要limitation／宣言deadlineの差替えを拒否 |
| 集合 | 追加・欠落・重複・別target、nested時刻／target／release不一致、非reviewedからの昇格を拒否。100件を別id計算で照合、101件を拒否 |
| finalize | reviewed→response_limit omissionだけ許可し、response_truncated不足を拒否。非解析行のstate／reasonを保持。集合の順序交換は許可 |
| one-shot | finish再発行・応答再消費・候補copy／別owner・候補二重消費を拒否。正常closeで未消費候補を破棄可能 |
| guard | issue全4点、応答全6点、固定終端全4点で停止。invalid bodyよりpost-guard停止を優先。候補・成功フラグを公開しない |
| 解放・失効 | source close／worker close／終了確認の不足、取消後の遅延消費を拒否。終了後の復活なし |
| 再入・秘密 | otherwise-validなsource closeへの捕捉再入も拒否。必要fieldのgetter／Proxy実行0、例外本文を出さない |

## 3 初回失敗・訂正

| 段階 | 観測と対応 |
|---|---|
| finish基本RED | 追加したstubが固定エラーを返し1件失敗。元header／E・同jobのconsumeとopaque候補を接続してGREEN |
| 集合RED | 固定空集合にassetを追加した応答が通り1件失敗。送信前manifestと返却の同一id集合照合を追加してGREEN |
| 終端RED | 一度限りconsumerのstubで1件失敗。source／worker終了確認、候補先行消費、固定root close後の限定summary返却へ接続してGREEN |
| finish送信失敗RED | 既存sendFailureがanalyze pendingしか見ず、finish送信のworker_unavailableをinternal_review_errorへ変えた1件。唯一のpendingとしてanalyze／finishの両方を扱い、U・先行理由を保持してGREEN |
| 途中の型検査 | 次のT_i試験用に定義したTが最初の3件では未使用で1エラー。未使用規則を緩めず、続くT_i／U試験が同定数を使用する段階で解消 |

新規合成コードの開発履歴であり、従来製品や実通信で同じ障害を観測した主張ではない。旧試験の削除・skip・期限の緩和は行っていない。

## 4 検証結果

| 検証 | 結果 |
|---|---|
| 新規＋関連 | 3ファイル／299件成功（WJ-C 76、WJ-B 66、WJ-A 157） |
| build | `npm run build`成功。test-only ownerはdistへ出力されない |
| standalone TypeScript | WJ-B／C試験・参照helperをstrict／noUnusedLocals／noUnusedParametersで検査、エラー0 |
| ESLint | 変更helper・新試験・変更梱包script、問題0 |
| 全体合成 | maxWorkers=3、238ファイル／10,478件成功、失敗0・pending 0。JSON開始〜最終試験終了は約35.4秒 |
| offline梱包 | `node tests/review/package-http-classification.mjs`成功、441ファイル。WJ-C試験path・terminal markerの混入負の対照を追加し、WJ-B/C ownerの純粋値import／時計・I/O・worker参照の禁止を維持 |

全体JSONはローカル一時領域`/private/tmp/servicenow-wjc-tests-20261102.json`。ファイル数はtestResults.lengthで集計した。梱包のcompiled fixtureは既存値／開発経路の回帰で、新WJ-C ownerの専用compiled保証やB-03完了には数えない。

## 5 残課題・未実施

今回のWJ-Cは**通常finishだけ**。worker期限型／phase期限型のprivate soft回復claim・世代移行、停止後finish、元CT-A／TB-Bからの正式供給、実選択集合・ReleasePermit／worker jobのbinding、外側の実cleanup／最終checkpoint、WJ-D／CT-C・B-03は未実装／未実施。既存の2種類のsoft移行・停止後部分集約はそのまま維持する。

exact layout／全work・全体資源上界・本番capはUnknown。正式発行口閉鎖・全体受付無効・VM／監視／telemetry調査保留を維持する。実worker／runtime接続・実通信・実機操作・トークン発行・設定変更・Permit発行・Pushは行っていない。無関係な`.vscode/`／`CLAUDE.md`は変更していない。
