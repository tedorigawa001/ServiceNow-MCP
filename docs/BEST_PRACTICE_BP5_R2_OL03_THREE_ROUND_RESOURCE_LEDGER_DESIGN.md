# BP-5 R-2 OL-03：3round resource台帳の詳細設計

Version: draft-0.2 / Date: 2026-10-21 / Status: 設計のみ（レビューでround枠のretry/tail収容とcleanup二重検査を明記）。session台帳・配賦・通常strict接続は未実装、運用上限は未承認。

## 1. 範囲と停止状態

[estimate消費型bridge](BEST_PRACTICE_BP5_R2_OL03_ESTIMATE_BRIDGE_DESIGN.md)と[現行collector費目設計](BEST_PRACTICE_BP5_R2_OL03_COLLECTOR_WORK_REDESIGN.md)に続き、Initial／BeforeM4／AfterM4の3roundが消費する独立resourceの会計を定義する。基準は `fad0749`。現行の `scan_ops.rs`、`normalized_metadata.rs`、`child_set.rs`、`collector.rs`、`profile.rs`、`strict.rs` と[単一bridge合成記録](E2E_BEST_PRACTICE_R2_OL03_ESTIMATE_BRIDGE_SYNTHETIC_2026-10-21.md)を照合した。外部仕様やOS APIを調査する工程ではない。

全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。本書は実装・OS接続・実機操作・token発行・設定変更・本番policy投入・permit発行を含めない。運用quotaの数値を新しく承認せず、設計完了や内部binding成功を実行権へ変換しない。

前工程の740テストは単一bridgeまでの合成検証であり、本書のsession台帳の検証成績ではない。workは課金ブロック、operationは単発source契約の試行であり、CPU時間・RSS・OS syscall数・hard期限の保証ではない。

## 2. 現状と変更対象

| 現行 | 本設計で追加するもの |
|---|---|
| `with_boundary` がscanごとに新しいLedgerを生成し、呼出し側から合成Quotasを受ける | 同一inspectionを通じて残るsession会計。roundローカルなresource identity・pending readは引き続き分離 |
| work100万・payload2GiB・startから10秒・EINTR残は元SharedBudgetを共有 | 再発行しない。session台帳はこれらの第二の消費元を作らない |
| attempts[Open/Enum/Read/Metadata/Cleanup]、names、live/peak、cleanup予約をscan内で管理 | round枠とsession累積枠の両方をsource操作前に検査する |
| `Summary.names` / `Quotas.name_bytes` はmetadataのxattr名コピー量 | `xattr_name_bytes` と意味を明示。directory列挙名やpath確保量を含むと解釈しない |
| `ClosureSource::scan` を使う通常strictは完全collectorへ未接続 | 通常strictの型付きadapterとcleanup証拠伝播は後工程。本書で旧traitへ数値だけを渡さない |

現行の `attempts[j] <= 1_000_000`、`live <= 132` は単一boundaryの構造的上限であり、運用quotaの承認値でもsessionへ3倍付与する根拠でもない。未知の上限・producer・費用を0や無制限で代用しない。

## 3. 内部型・binding（擬似契約）

以下の名称・型は提案であり、コンパイル済みAPI・JSON schemaではない。

| 型 | 契約 |
|---|---|
| `ScanSessionLedger` | inspection ownerが一度だけ作る非Clone/非serdeの所有型。予算origin、元started、receipt/target/contextの由来、固定model、進行状態と累積量を保持 |
| `RoundResourceScope` | 同sessionへの短期・排他的borrow。現在のRoundScope object/tokenと固定round slotへ結合し、同時に2個のactive scopeを作らない |
| `RoundLocalLedger` | source/handleのidentity、serial、pending read/宣言、当該roundの消費・予約・liveを保持。前roundのresourceを次roundへ持ち込まない |
| `ResourcePolicy` | 保護されたproducerが固定modelと共に供給する承認上限。ScanWorkEstimateから生成しない。未提供/未知modelはUnavailable |
| 終了証拠 | round差分とsession累積量、cleanup状態・有限理由のみ。Observation・再試行権・permitを含めず、実行条件へ再入力しない |

session生成には元inspection owner側のone-shot claimが必要。同じreceipt/budgetから別sessionを作り、残を満額へ戻す経路を設けない。このclaimと保護されたproducerは今後の実装対象で、ローカルなconstructorだけで成立したことにはしない。

bindingは、元SharedBudgetの `inspection_origin` のRc identityと元started、同RecordReceipt/lineage、同target/contextへのborrow、同固定collector/resource modelを要求する。同じhash/generation/path文字列だけでは代替しない。receiptのrecord binding（release/generation/index/registry等）は既存strict再読/照合で毎回検証し、変更された値へsessionを再bindしない。

round開始時は同RoundScope object/token、同宣言、元session originを検査する。同名roundの新tokenへの再発行、別receipt/target/budget/startへの持込み、sessionコピー、入力数値からの復元は禁止。Debugは固定opaque labelとし、pointer・path・code・資格情報を出力しない。

## 4. 台帳の種類と所有

| 資源 | 会計単位 | 予約・消費・上限 |
|---|---|---|
| source attempts | Open/Enum/Read/Metadata/Cleanupの5分類、roundとsessionの累積 | 成功だけでなく失敗・Interrupted・拒否に至る最後のsource試行も含む。消費を返金しない |
| cleanup予約 | 未処理解放試行の個数 | acquire前に1枠予約。成功handleへ移譲し、Dropで一度だけ実消費。累積cleanup実消費と未使用予約を分ける |
| live owner / acquire中予約 | 同時数とsession peak | Anchor/Directory/File/Cursor/Aclを区別して所有。3roundのpeakを加算しない。種類別内訳なしにOS FD数と呼ばない |
| xattr名bytes | round/session累積 | 実コピーbytesを計上。最大64KiBのbuffer capacityをI/O前に照合し、遅延/不正応答も既存方式でboundedに会計 |
| directory列挙名 | enum試行・最大255byte buffer | 現行namesへ混ぜない。単発bufferはbounded。総コピー量を別枠にするかはpolicy/操作上界設計で明示し、未計数なら運用受付不可 |
| payload bytes | 元SharedBudgetのused/reserved | 成功bytesを同じbudgetへ一度だけ加算。session側に控除可能な複製枠を作らない。失敗EOF probeの実bytesも保持 |
| retry | 元SharedBudget.retries_left | session開始時r0を記録。read/EOFの合法EINTRだけが元残を消費し、round切替で補充しない |
| 管理allocation | count配列・groups・route・observed・hash/name buffer等 | 同時寿命/最大数の別設計が必要。live owner数やworkだけでmemory受付済みにしない |

失敗source試行で返却handleがないこと、hidden retry/open/refill/成長allocationがないことはScanOps契約の前提である。native syscallへの1対1対応やOS内部bufferは未検証。

## 5. 累積枠と3round配賦

固定slotは0=Initial、1=BeforeM4、2=AfterM4とする。policyはsession capと各slotのround capを別に持ち、両方を満たす場合だけ操作できる。未使用round枠を自動的に別roundへ移譲せず、session残もround境界で再初期化しない。

各分類jのsource試行前に、checked算術で次を確認する。cleanup以外の通常試行は、**現在slotのround累積とsession累積の両方**を一体で更新し、他slotのround累積は更新しない。Cap不明はUnavailable、overflow/不足はLimit、binding/順序違いはBinding。

```text
round_used[j] + 1 <= round_cap[slot][j]
session_used[j] + 1 <= session_cap[j]
```

総操作数上限を採用する場合は5分類和もchecked算術で検査し、cleanup予約まで含めて二重の枠を保持する。分類別capの単純合計を承認済み総capとみなさない。

配賦に使う上界は現行の固定collector scheduleに結合した新しいresource submodelとして導出する。候補識別子は `bp5-r2-scan-resource-0.1`（未実装/未承認）。旧 `bp5-r2-scan-work-0.1` の仮定係数・予定操作式を認証として流用しない。work用profile/estimateは操作quotaを発行せず、必要統計の追加・収集費も別途モデル化する。

概念式は次のとおり。数値係数は後続のsource操作別計数・独立oracle検証が終わるまで未確定とする。

```text
U_session[j] = sum(U_round_base[slot][j], slot=0..2)
             + U_shared_retry[j](r0) + U_global_terminal_tail[j]
```

各baseには固定祖先walk/rewalk・snapshot・列挙・read/EOF・cleanupを含める。成功より長い拒否prefixも覆う。共有retryは全sessionで最大r0回、枯渇等の最後の異常試行は失敗で全工程が停止することを前提に一度だけ計上する。tailを各baseに含めた場合は再加算しない。read以外はEINTR/WouldBlockを再試行しない現行契約を維持する。

### 5.1 round枠のretry/tail収容（2026-10-21、レビュー）

共有retryはsession全体で最大r0回だが、どのroundで発生するかは事前に決まらない。正当なEINTRがr0回すべて1つのroundへ集中し得るため、round枠を `U_round_base[slot][j]` だけで作るとそのroundのRead枠が先に尽き、正しい動作をLimitで拒否する。最後の異常試行（terminal tail）も発生roundを事前に特定できない。従ってround枠の必要量は次とする。

```text
round_cap[slot][j] >= U_round_base[slot][j]
                    + U_shared_retry[j](r0) + U_global_terminal_tail[j]
session_cap[j]     >= U_session[j]   # retry/tailは1回だけ
```

- round枠の総和はsession必要量より約 `2×(U_shared_retry[j](r0)+U_global_terminal_tail[j])` 大きくなる。これは二重付与ではなく、session枠がretry/tailを全体で1回分に抑える。round単位の余裕を他roundへ移譲しない§5本文の方針とも両立する。
- 各roundの検査はround枠とsession枠の**両方**で行うため、round枠の余裕だけで共有retryを各roundへ再付与したことにはならない。retry以外の分類でtail分の余裕を持たせる場合も同じ規則を使う。
- 次roundのfresh profileは減ったrを読むが、round枠の必要量は保守側（session開始時のr0）で固定してよい。減ったrに合わせてround枠を縮める場合も、session枠と実消費を巻き戻さない。

capはこの必要量を収容できる承認policyでなければならないが、上界が小さいことだけでcapを承認しない。将来roundの予測から実消費を差し引いて枠を復活させず、実施済みの固定phaseだけを予定から除外する。

## 6. 同時最大数・cleanup予約の遷移

acquireにはOpenだけでなくMetadata分類のACL initも含む。dispatch直前に、round/sessionの通常試行枠に加え、両方のcleanup枠・live枠を確認する。

```text
cleanup_used + cleanup_reserved + 1 <= cleanup_cap
live_owned + live_reserved + 1 <= scan_live_cap
```

cleanup枠は§5と同じく**現在slotのround枠とsession枠の両方**でこの式を検査し、予約・実消費も両方へ一体で計上する（round_cleanup_used/reservedとsession_cleanup_used/reserved）。live枠は同時数であり累積ではないため、roundとsessionで同じ現在値を検査し、peakはmaxで記録する。

運用では `outer_held_owners + scan_live_owned + scan_live_reserved` がrole全体の承認された同時上限へ収まる必要もある。target/record/topology側の保持量・余裕は保護されたcontextから得る設計が別途必要で、不明なら運用開始しない。scanの既存132をそのままrole余裕とせず、peak×3にも変換しない。

1. checkedな候補値と全枠を検査し、元budgetへdispatch/cleanup分をprechargeする。新しい台帳処理のwork費は§10で別評価する。課金中停止ならsourceを呼ばず、spent workは返さない。
2. round/sessionの試行消費・cleanup予約・live予約を一体でcommitする。片側だけを書き換えた後で失敗する構造にせず、source呼出し中にRefCell等のborrowを保持しない。
3. handleを返したらpost-operation checkpointより先にRAII ownerへ移す。live予約をlive所有へ変換し、cleanup予約は保持する。遅い成功でも必ずownerが解放する。
4. handleなしの失敗では未使用cleanup/live予約だけを取り消す。試行消費とworkは返金しない。成功を装って返却されないresourceはsource契約違反で、台帳だけでは救済しない。
5. Dropは予約済みcleanupを一度だけ試行し、cleanup_reservedをcleanup_usedへ変換する。取消/期限/work不足で解放を省略しない。数値FDへの再close/retryは禁止。
6. 解放未確認ならunconfirmedを永続記録して停止する。Rust ownerが手放されたためlive_ownedが0になっても、OS上の解放や容量回復を証明したとは扱わない。次のacquire/roundへは進ませない。

複数のownerはそれぞれ自分のprepaid cleanupを続けるが、新しいresource取得は停止する。summaryはsessionへの加算源ではなく既に課金した差分の証拠とし、round完了時に同じattempts/namesを二重加算しない。

## 7. round順序とone-shot

提案状態は `ExpectInitial → Active(Initial) → AwaitStrict(Initial) → ExpectBeforeM4 → Active(BeforeM4) → AwaitStrict(BeforeM4) → ExpectAfterM4 → Active(AfterM4) → AwaitStrict(AfterM4) → Finished`。どの段階からも失敗はterminal `Stopped`。rollback/reset/resumeはない。

- round入口は元sessionの試行状態を最初のfallible guardより先に消費する。別session/別slotの状態を書き換えない。開始途中の取消・期限・binding不一致でも同slotをやり直さない。
- 同じroundの重複、AfterM4先行、slot飛越し、並行active、Finished後の追加開始、Stopped後の再入場をsource操作前に拒否する。
- scope/tokenはActiveの間だけ有効。resource/pending read/未完了宣言がround外へ逃げるAPIを設けない。
- bridge成功かつlive/予約/unconfirmed/pending retry/宣言残がすべて0の場合だけAwaitStrictへ移す。bridge単体では次roundを許可しない。
- 次slotへの進行は同じround/phaseのAfterScan→record/path/metadata/time再読→strict record検証→FinalIndex/clockの成功に結合する。caller指定boolや任意の「完了」methodでは進めない。
- BeforeM4とAfterM4の位置は既存 `compare_topology` のcallbackと復帰位置に固定する。台帳がround番号を順に消費しただけで、M4を実施済みとはしない。

通常strict接続では、このAcknowledgementを既存の型付きphase ownerから一度だけ渡す内部契約が必要である。本書ではそのAPIを実装せず、旧ClosureRequestにsession ID文字列だけを追加して代替しない。

## 8. 共有retryとpayload

read/EOFは同resource serial・同offset/length/eofのpending requestだけを再試行できる。EINTR1回ごとに元SharedBudgetのretry残を1減らし、attempts[Read]のround/session枠も1消費する。session開始時r0は会計の上界用であり、各roundへr0を配る値ではない。

pending requestがある間は別操作・別resource・次roundを拒否し、retry枯渇・取消・期限・短読取・異常応答で停止する。scope終了時のpending retryを消して成功に戻さない。合法EINTR後はrが減るため、scan終了時に入口rとの等値を要求しない。次roundのfresh profileは同budgetの減った残を読む。

payloadは全3scan・target A/B・record等で元のused/reservedに従う。既存予約を押し退けず、read直前に要求長が入ることを確認し、応答後の実bytesを一度だけ加算する。成功EOFは0bytesでもread試行を1消費する。異常EOF/短読取でコピー済みのbytesを返金しない。record等の既存会計をsessionから再加算しない。

## 9. 失敗時停止・終了証拠

| 条件 | 主理由と扱い |
|---|---|
| 元budgetのsticky失敗・取消・期限 | 既存の最初の理由を維持し、sessionもStoppedへ。新scope/予算を作らない |
| receipt/budget/start/token/round/状態違い | Binding。数値generation等の実変更は既存strictのChangedを保持 |
| policy未提供/未知model/取得不能 | Unavailable。fallback・満額補充なし |
| 累積/同時枠不足・checked overflow | Limit。source操作前に停止、予約済みcleanupは継続 |
| hash/metadata/path/集合/short read等 | 既存Failureを保持。後続strict phase/roundへ進めない |
| cleanup不明・未解放/予約残 | 成功禁止。先行理由がなければUnavailable、既存理由があれば上書きせずcleanup不成立を別保持 |
| pending retry・未完了宣言 | 現行のReadFailed/Changedを維持し、停止/解放を実行 |

NotStartedとCollectedを区別し、前者に架空のcleanup完了票を作らない。Collectedの既存summaryとsession差分/累積を保持し、resultだけをResultへ変換して証拠を捨てない。bridgeの終端checkpointで成功を破棄した場合も同じ規則を使う。

roundローカルなowner破棄とsession終端後も、unconfirmed/停止理由を消さない。hostの終了票・cleanup_incomplete・強制停止への接続は別設計で、台帳が0になったことをOS終了確認と同一視しない。

## 10. 費目所有・model更新

現行kernel S1902、O.use7、O.dispatch1、単一bridge1910、profile/計算込み1991は変更前の合成基準値である。session照合・累積枠検査・予約commit・終端集約を追加してもこの値を無条件に維持すると約束しない。

- session生成/round開始・終了・strict acknowledgementはO側へ新しい課金点を設計する。
- 各source試行の追加会計はS側のどの分類が所有するかを固定し、cleanupのworkは取得時prechargeで覆う。Drop時に停止済みbudgetへ新workを要求しない。
- 単一dispatchの既存課金へ新しい可変長走査やsession集計を隠さない。固定配列5分類以外のiteration、合計算術、allocationも明示する。
- collector/kernel/resourceの実処理が変わる場合は関連model/係数と独立oracleを改版し、旧estimateで新kernelを通さない。guard7/入口guard1の費用変更も必要なら別途記録する。

現在のwork上界による実閉包規模の試算は3round約1,160万〜1,165万で、元100万を超える。resource台帳完成はその問題を解消しない。未知のI/R/O・allocation・OS費を0にせず、[全体受付設計](BEST_PRACTICE_BP5_R2_OL03_TOTAL_WORK_ADMISSION_DESIGN.md)の全体受付は無効のままとする。

## 11. 合成テストの受入条件（未実施）

1. 同receipt/budget/startで3roundを順に実行。各round残があってもsession総枠の境界±1で停止し、次roundでattempts/xattr/cleanup消費がresetされない。cleanup枠もround/sessionの双方の境界±1で検査する。正当なEINTRをr0回1つのroundへ集中させても§5.1のround枠内で成功し、session枠を超える追加retryは拒否されることを確認する。
2. 別receipt/target/context/origin/start/token、新sessionでの再開、同名roundの新scope、重複/飛越し/並行/Finished後/Stopped後をsource呼出し0で拒否。
3. acquire前のcleanup/live枠不足はopen/ACL initを呼ばない。失敗acquireでは未使用予約のみ戻り、試行とworkは保持。成功/遅延成功はpost-guard前にowner化。
4. 全source失敗点・cleanup不明点で、全ownerが一度だけ解放を試行。取消/期限/work不足でもprepaid cleanupが走り、先行理由とunconfirmedが両方残る。
5. 3roundのpeakはmaxでありsumでない。他ownerを含む同時枠不足・予約中境界・解放未確認時の容量再利用禁止を検査。未取得枠だけの解除を累積返金と誤らない。
6. data/EOF両方で共有r=0/1/8、複数roundに跨る分割消費、枯渇後の最後の1試行、pending request違い/低水準迂回を検査。
7. xattrの0byte応答用1byte probe、64KiB境界、不正/遅延応答、コピー後停止を検査。directory列挙名とxattrの枠を混同しない。
8. payloadの既存予約を保持し、3scanの再読分を計上。EOF0、短読取/異常応答・遅延成功の実bytesを保持し、二重課金/返金なし。
9. bridge成功だけでは次roundが開かず、AfterScan・record再読・FinalIndex・clockのどこかで失敗すると後続source操作0。cleanup不成立のsummaryも外側へ保持。
10. checked overflow・未知model・未提供cap・全不足prefix、算術/新guard課金中の取消/期限を検査。操作計数の独立oracleと費目別auditで新しい上界を照合する。

synthetic policy/context/sourceはtest専用とし、運用producerの承認へ昇格させない。合成上の操作数/owner解放とOS syscall/FDの実証を分ける。

## 12. 実装順・承認待ち

1. 現行collectorに対応するsource操作別費目・必要shape統計・拒否tailを導出し、純粋resource上界と独立oracleを合成検証する。
2. session内部型・唯一の生成claim・round順序/binding・停止理由を合成resourceで実装する。運用capは投入しない。
3. round/sessionの累積会計・cleanup/live予約・summaryの移動を固定collectorへ接続し、新しいwork所有/modelを計数する。
4. 通常strictの型付き開始/acknowledgement/終了証拠契約を別途設計し、前後厳密照合を維持した合成経路だけへ接続する。
5. 全体I/R/O・独立resource・管理allocation・承認producerを合算して審査する。OS接続・受付有効化・permitは別承認である。

未確定：各運用cap/総操作枠、role側の保持resource内訳、source操作上界の係数、列挙名総量の別枠、管理allocationの同時上界、新会計処理のwork費、唯一生成claimとstrict acknowledgementの正確なRust寿命、hostへのcleanup証拠伝播。実sourceの内部操作/blocked I/O、system祖先policy、更新lease/ABA/全検査後差替え対策は別の停止課題である。

## 13. 本文書の検証範囲

文書更新のみ。新規本書と親3文書の相対リンク先55件、fence対応・末尾改行・末尾空白・diff checkを確認し、変更対象がMDだけであることを確認した。簡易リンク検査の初回実行ではコードブロック内の `U_shared_retry[j](r0)` をリンクとして誤認したため、コードブロック/inline codeを除外する検査へ改め、数式と実リンクを区別する回帰入力も通した。節anchor内容まで自動照合したものではない。

コード実装・Rustビルド/試験の再実行は行っていない。本書の実装試験が未実施であることは§11のとおり。
