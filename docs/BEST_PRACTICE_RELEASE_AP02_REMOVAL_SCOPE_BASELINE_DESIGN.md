# AP02：撤去対象と維持する通常経路の範囲基準

Version: release-ap02-removal-scope-baseline-draft-0.3 / Date: 2026-11-19。
Status: **対象範囲の設計基準。撤去・実装・旧試験の変更は未承認。** 読取り基準HEADは`2837181`。[AP02／03親設計](BEST_PRACTICE_RELEASE_AP02_AP03_REMOVAL_COMPATIBILITY_DESIGN.md)のR01〜08、K01〜06と[入口7件の引渡し](BEST_PRACTICE_RELEASE_AP02_AP03_AP05_ENTRY_DECISION_HANDOFF.md)を、同revisionの定義／利用／停止・解放／成果物に結ぶ。AP03のC05-B＋C07-B、C02〜04の案P、C06の方針を前提とする。これらの採用記録は基準HEAD時点では未コミットで、当時の[C07比較設計](BEST_PRACTICE_RELEASE_AP03_C07_SOURCE_CONSTRUCTOR_ARGUMENT_DESIGN.md)・AP02／03親設計のD04は未選択だった。採用記録は `53eff59` でコミットされ、採用判断の根拠は[C05／C07採用記録 draft-0.4](BEST_PRACTICE_RELEASE_AP03_C05_C07_COMPATIBILITY_DECISION_DESIGN.md)と[C02〜04／06採用記録 draft-0.2](BEST_PRACTICE_RELEASE_AP03_C02_C04_C06_COMPATIBILITY_REVIEW.md)に置く。AP02-S02のC07-B、AP02-S03の案Pの記述は、その採用範囲の範囲設計として読む。具体patchの全到達辺・外部利用・実tarballは未確認で、閉包不在の証明ではない。

draft-0.3のレビュー修正：レビュー修正の基準HEADは`a191bfd`（修正時のHEADは`a191bfd`）。採用記録（C05／C07採用記録draft-0.4、C02〜04／06採用記録draft-0.2）が `53eff59` でコミットされたため、Status行の「未コミット」「確定するまで採用済みの根拠として扱わない」を基準HEAD時点の記述に改め、採用判断の根拠を同コミットの両記録に置いた。これに伴い§4のローカル参照数を17とし、数の時点と内訳を更新した。引渡し文書と親設計にある本書への参照ラベルもdraft-0.3に更新した。撤去範囲・維持境界・S01〜07／K01〜04の内容は変更しない。

draft-0.2のレビュー修正：レビュー修正の基準HEADは`d30aebf`（修正時のHEADは`d30aebf`）。Status行でAP03の採用を「所与」としていたが、採用記録（C05／C07採用記録、C02〜04／C06レビュー）が未コミットで、コミット済みのC07比較設計・親設計D04は未選択のままだったため、「前提」と書き換えて採用記録の確定待ちであることを明記した。末尾に静的確認の記録を追加した。撤去範囲・維持境界・S01〜07／K01〜04の内容は変更しない。引渡し文書と親設計にある本書への参照（draft-0.1）は作業中の変更と重なるため、今回は更新していない。

正式発行口・C実行入口／body起動閉鎖、全体受付無効、通常経路未切替、Unknown・調査保留、元期限・既定並列度を維持する。今回の変更はMDのみ。実装・撤去・発行／claim消費・旧試験変更／再実行・build／pack・実接続・実通信・設定変更・公開・コミット・Pushは行わない。

## 1 撤去・分離する単位

「撤去」は候補本番の実行・型・配布の到達辺を切る意味。下記の旧source／試験を今削除する指示ではない。「保持」は候補でも元契約を残す意味。名前の一部や型だけで撤去対象を判定しない。

| ID／親範囲 | 本番から切るもの | 同時に残すもの・境界 |
|---|---|---|
| AP02-S01／R01 | [bounded-read](../src/servicenow/bounded-read.ts)の`takeStatusAcceptanceProbe`／`takeNativeStatusCompositionProbe`、別々の`statusProbe`／`nativeStatusProbe` slotとstatic代入、`#runStatusAcceptanceProbe`／`#runNativeStatusProbe`／`#probeStatusAcceptance`、専用`pinStatusProbeFake`／型・native driver | classの通常constructor、factory、通常closeを保持。名前付きexportだけ消して登録本体・private runnerを休眠させない。2組を別々に追い、別名・shim・再登録を作らない。SA-26／ND-30を旧試験として保持 |
| AP02-S02／R02・03 | `sourceConstructionClaim`／`claimPrivateCompositionSource`とstatic登録、[bounded-source](../src/review/bounded-source.ts)の`CompositionSourceConstruction`／旧creation branch、`key`・`check`・`take`・`takeStatus`・`rejectStatus`・`capture`・観測callback、`StatusAcceptanceDraft`／専用permissions | 通常の`new BoundedUpdateSetSource(session,input)`は残す。C07-BでJSの明示undefinedのみ互換、他の第3値・4個以上は同期拒否。任意callbackを受け付けず、通常の初期sourceは同root内で作る。SA-25／ACK-34・35／CR04の旧拒否位置を不在検査で代替済みにしない |
| AP02-S03／R04 | `prepareNewReviewComposition`のsynthetic overload、`PreparedSummary`、`pinCompositionFakeIO`を呼ぶ分岐、`#prepareCompositionIO`・そのfixed callback、fake専用`#finishCompositionTime`、ack／capture・handoffの実行辺 | 公開static methodと通常同期`ConstructorSummary`は保持。案Pでown synthetic_ioを外側で同期拒否。通常省略時は§2。lifecycleの`inspectSource`が返す通常結合の`prepared_only`識別子まで一括削除しない |
| AP02-S04／R04・07 | sessionのfake専用`ReleaseInputOrigin`／`ReleaseInputProjection`、`#releaseInput*`、`#captureReleaseInput`／`#consumeReleaseInput`／`#failReleaseInput`、`#releaseObservation`／`#releaseComparison*`／`#releaseTimeDiagnostic`と`#clearReleaseComparison`への実行辺。共有fieldとの一括削除は不可 | constructorでpinする`startedAt`・単一期限・`releasePolicy`、実sourceの観測日時／従来release判断、通常runの一次理由・失効・closeは残す。`#clearReleaseComparison`のstop直結は旧TB-Bの試験境界（§3）。削除はその旧責務をAP01／05へ渡した後だけ |
| AP02-S05／R05 | [review-composition-fake-io](../src/servicenow/review-composition-fake-io.ts)から本番sessionへのimport辺と、同moduleのJS／宣言／各mapの本番同梱。transcript pin／copy・専用Response／Streams・dispatch／disposeは別試験成果物側の責務 | `review-canonical-budget`、`review-canonical-bootstrap-budget`、通常fetch／typed取得・会計を同じ名前だけで落とさない。lifecycleにも参照のある`review-bootstrap-contract`は初回のmodule撤去対象にしない。session側の旧fake呼出し辺と共有契約のmoduleを分ける |
| AP02-S06／R06 | [SA wrapper](../src/review/abort-scope-evidence-source-status-probe.ts)／[ND旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)のmodule評価時friend取得と実classへの閉鎖probe辺を本番と分離 | wrapperを旧試験で保持し、純粋診断・無bridge注入・resource所有はB-03に引き継ぐ。現行も指定wrapperは梱包除外だが、本番側の取得関数の不在ではない。LM03未完了・UN62別審査を維持し、新friend／台帳共有／optional bridgeで代替しない |
| AP02-S07／R07・08 | sessionの`#compositionKey`／`#compositionSource`／`#compositionRevoke`を旧fake継続から切る。stop／close／rollbackの該当field参照と発生点を併せて分離 | `#compositionStarted`・`#checkComposition`の通常用の意味、通常`check()`の期限・取消、constructionの`source_transport`を含む固定診断shape・rollback順は削除対象外。共有writer・未確認解放が残る場合は境界を再設計する |

AP02-S04は**runtime sessionからの時計比較／引渡し接続の除去**。既存梱包検査が同梱を期待する `release-family`／`release-comparison`／`release-observation`／`release-comparison-receipt`／`release-time-owner`／`release-time-handoff` の値・補助module自体は初回撤去対象外。単独moduleの提供範囲を変える場合はAP02／03／05へ戻す。保持することは、正式な観測／worker接続を開く意味ではない。

## 2 残す通常経路と所有権

| ID／K | 維持する流れ | 受入境界（未実施） |
|---|---|---|
| AP02-K01／K01・05 | [client](../src/servicenow/client.ts)・create／直接new → snapshot／認証mode・provider pin → clock・元期限・既存fetch／signal／低減limits → 単一core・admission・登録owner | 同じC/G/P・final4予約・元floor、construction／run診断の分離・first reason。失敗時のpartial rollbackとcopy、枠・listener・timer・snapshotの解放は通常側に残す |
| AP02-K02／K02・03 | [source](../src/review/bounded-source.ts)の通常2引数 → GETの`readParent` → `resolveRelease`／実観測・設定競合・legacy判定 → matched時のPermit／releasePort／固定release snapshot → `bindReviewReleaseSource`とowner／ready照合 → metadata／payload／verify | 初期source claimと後段Permitを混同しない。`releasePortFor`／`#requirePermit`、foreign／copy／close後拒否、通常のfallback／C方式と観測時刻を維持。外部callbackの除去で`#observeRelease`全体を消さない |
| AP02-K03／K04・05 | [adapter](../src/review/update-set-adapter.ts)の通常sourceとworker → 既存0.2／0.3出力・取消・終了待ち → 通常`stop`／`#close`／`#rollbackConstruction` | 既存のunknown／mismatchedと公開制限、本文非露出、stop後のowner失効・会計終了を保持。新status fallback・Dの返値・根拠のないcleanup confirmedへ置換しない |
| AP02-K04／K06 | options省略時の`prepareNewReviewComposition` → fresh session → `#prepareComposition`／`#openComposition`の2引数source → transport claim → `bindInitialSource` → `claimStatusBinding` → 同coreの`takeBootstrapAccounting`／`connectAccounting` → constructionの`bindSource` → reserve、inspect、finally release、固定close | [lifecycle](../src/servicenow/review-evidence-lifecycle.ts)のこのstatus bindingは**残す**。省略時にも実際に使い、同session／snapshot／core／lease／owner／sourceを照合する。公称`constructor_bound`、auth=false／ready世代0、C/G/P=0、予約返却・dispatch不可・evidence無効、固定key／freeze、phase予算を維持。summaryや値コピーで結合を偽装しない |

AP02-K04のscopeは、残すownerから作る内部継続だけ。別rootでの試験成功・字面の同一性は正対照にならない。`#openComposition`は変数`creation`を省略時にも第3引数に置いているため、維持側の呼出しを本当に2引数へ変更する。共有construct／stop／closeの途中で旧専用枝だけが消えることを、失敗prefixと元予約の保持を含めて確認する。

## 3 配布物・旧試験との境界、実装前の停止条件

- **PK01／FX05：** [canonical梱包検査](../tests/review/package-canonical-budget.mjs)は今、fake I/OのJS／宣言／両mapを同梱期待とし、旧compiled ackも起動する。候補ではS05不在とcanonicalの通常正対照を分ける。後から同梱期待を反転し旧試験を切り替えるのはAP05の別判断。
- **PK02／03・FX03／04／06：** [HTTP梱包検査](../tests/review/package-http-classification.mjs)は旧SA／NDのcompiled fixtureを配布外distで実行し、値module同梱・`stop`から`#clearReleaseComparison`への直接呼出しも検査する。S04の実行辺を切れば最後のassertionは意図的に旧と異なる。削除やskipではなく、旧TB-Bの責務／保証差と新候補の不在・通常stopの対照を分けて審査する。[B-03](BEST_PRACTICE_RELEASE_B03_COMPILED_MIGRATION_FAULT_DESIGN.md)の旧NDとUN62は別管理。
- **候補本番の証拠：** 承認後、空buildと隔離tarballを同revisionに固定し、通常import・通常経路の正対照、旧名・登録・到達辺・fake moduleとstale JS／宣言／mapの不在、別名／再export／動的辺・混入で検査が落ちる負対照をそろえる。ソース文字列検索だけで全閉包や実配布物の不在を主張しない。必要module欠落による起動不能を不在成功にしない。

次に承認へ渡す単位は、S01〜07とK01〜04の対応、同revisionの対象patch／全参照と成果物、ED01〜07の旧assertion差、AP01／04／05へ残す保証、候補の正負対照と停止時の責務。**未解決の動的参照、共有writer、未確認resource、保証差の処遇が残ればその単位は停止**。今回確定したのは設計上の撤去範囲と維持境界であり、実施承認・保証回復・試験処遇・AP06公開は未承認。

## 4 静的確認

基準`d30aebf`で、本文に実名で挙げたsession／source／lifecycleのシンボル、`review-bootstrap-contract`のimport元、PK01（canonical梱包検査）のfake I/O同梱期待と旧compiled ack起動、PK02（HTTP梱包検査）の`stop`→`#clearReleaseComparison`直接呼出し検査とrelease系値module 6件の同梱期待、`#openComposition`の省略時3引数呼出しを静的に照合した。本書のID11行（S7／K4）、表2・ローカル参照15（draft-0.2時点。draft-0.3でStatus行に採用記録2件を加え17）・明示anchor0、ローカル参照先・表列数・末尾改行・差分空白を確認し、変更は本書1件のみ、stage0、製品・試験・設定の差分はない。製品module import・試験再実行・build／pack・実tarball確認は行っていない。
