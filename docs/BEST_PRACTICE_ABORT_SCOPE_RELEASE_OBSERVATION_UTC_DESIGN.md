# RC-03：観測UTCの採取・失敗・上位時刻の契約

Version: br006-release-observation-utc-draft-0.3 / Date: 2026-11-01。
Status: **OU-01の一度限り採取・pre/post guardを既存fixed fake-200継続だけに限定実装（§9）。通常実source差替え・比較器入力化・上位時刻結合は未実施。実接続・実通信・実機操作・設定変更・実Permit発行・Pushは行わない。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。**

設計基準`cd14e20`、OU-01基準`d95faca`。[RC-03親設計](BEST_PRACTICE_ABORT_SCOPE_RELEASE_ADOPTION_RC03_DESIGN.md)と[deadline再利用契約](BEST_PRACTICE_ABORT_SCOPE_RELEASE_DEADLINE_REUSE_DESIGN.md)の観測UTCに関する残差を具体化する。RP-01の同session projectionへOU-01の限定採取を追加したが、比較器接続・上位整合検査は未実装／未検証。本書を本番切替の承認にしない。

## 1 現状と今回の差分

| 現状の根拠 | 現在の動作／残差 |
|---|---|
| [実source](../src/review/bounded-source.ts) `#observeRelease` | 取得・projection後にguard。resolved／conflict分岐で`new Date().toISOString()`を採り、空200・未知値・上限等のunknownでは採らない |
| [純粋比較器](../src/servicenow/review-kernel/release-comparison.ts) | complete_200にはobserved_atが必須。空配列でも同じ。not_requested／invalid_observationはobserved_atを持たない。比較器自体は時計を読まない |
| [payload取得側](../src/review/update-set-adapter.ts)／[解析側](../src/review/payload-review.ts) | adapterが取得時にUTCを採り、解析はそのretrieved_atをreviewed_atにも使う。reviewed_atは現在の実装ではCPU解析終了UTCではない |
| [1件schema](../src/review/result-schema-v2.ts) | 実測／競合のobserved_at <= reviewed_at、retrieved_at <= reviewed_atを検査。全runのUTC単調性を証明するものではない |
| [集約finalize](../src/review/aggregate-finalize.ts)／[集約schema](../src/review/aggregate-schema.ts) | workerがended_atを採取。started_at <= ended_at、差がlimits.deadline_ms以下、入れ子reviewed_atがrun区間内、実測／競合の観測がended_at以前であることを検査 |
| [adapterの集約初期値](../src/review/update-set-adapter.ts) | 現在の出力宣言limits.deadline_msは60000。sessionで低減した実効Lが自動でこのfieldに反映されるわけではない |

空200にもUTCを追加採取すること、guardと採取位置を固定すること、逆行を早期に拒否することは**挙動差分**であり、既存と無変更とは説明しない。以下は将来のfake依存試験の受入案であって、現在のコードが全項目を強制するという主張ではない。

## 2 時刻の意味と不変条件

- **S**：同sessionの構築時`startedAt`。設定pinと同じ開始UTC。
- **L**：同sessionの既存`deadlineMs` getterから得た元の全duration。最大60000ms。RP-01で元pin値との結合を検査する。
- **O**：同sourceのcomplete_200受理に対応して一度だけ採る観測UTC。本契約の対象。
- **T_i**：payload取得時のUTC。既存契約どおり各1件のretrieved_at／reviewed_atへ渡す。
- **E**：workerの集約finalizeで採るended_at。
- **M／remaining**：元のmonotonic開始と同canonical予算からの残時間。中断・待機・phase／cleanup枠の判定用。

S／L／pin済みpolicyはO・T_i・Eに合わせて変更しない。設定有効性の起点は常にS、必要な期限は厳密にexpires_at > S+L。設定providerの再実行・観測時点での再pin・残時間をLへ代入する処理は禁止する。Sとmonotonic値を相互変換せず、UTCから新しいtimer／実行期限を作らない。

以下の時刻比較はDate.parseによる同じ単位のUTC epochで行う。等しい値は許可する（同じms内の処理を逆行としない）。採取回数の「一度」はrelease観測Oについてであり、S・payload T_i・集約Eまで全体で1回という意味ではない。

## 3 固定採取順序と一度限りの消費

将来の200継続は、**同attemptの取得／必要なtyped cleanup確定→同body bytesの受理・decode／同sourceの行projection→取得後guard→Oの採取／検査→再guard→固定比較器→比較後guard→private受理前guard**の順とする。通常経路とprivate ack経路のguardは各ownerの既存のものを用い、交換しない。cleanup未確認を時計値で救済しない。

1. 同session／source／keyに結合した200継続だけがOを要求する。callerのobserved_at、D用固定日時、別source値、公開summary／draftを実測の供給元にしない。
2. guard通過後、同ownerの未採取→採取中を**時計呼出し前**に一度だけ消費する。再入・二重要求・失敗後の再採取は拒否する。既存cached promise／claimを復活させない。
3. 実時計を読む処理はその箇所の`new Date()`1回を基準とする案。得た同じDateの数値とISO表現を検査し、`Date.now()`と別の`new Date()`の二重読取をしない。非有限値・ISO化例外・既存schemaで受理できない表現なら失敗。例外時も時計を再読せず、同ownerのguard／停止slotから先行理由を確認する。canonical UTC表現は現在のISO形式と最大40文字の入力契約内に収める。任意の公開clock providerは追加せず、fake試験では外部時計境界を制御する。
4. S <= O <= S+L、および同runで直前に受理したUTCがある場合はそれ以下へ戻っていないことを検査する。採取直後のguardで先行停止を再確認する。O=S+LのUTC等号だけでは成功／期限切れを断定せず、monotonic予算のguardも必須とする。
5. 正常なOをprivateな不変値として同projection／同sourceの比較入力へ一度渡す。比較器や結果copyから時計を再読しない。close／失敗時は未公開O・比較候補を失効させ、例外や時計objectを外へ出さない。

Oは「payloadやBRを解析した時刻」でも「PDIのサーバー時計」でもなく、クライアント側で同観測を受理したUTC。認証された外部時刻・NTPの正確性・絶対的な時刻証明は主張しない。

## 4 空200・取得なし・不正応答の区分

| 入力 | Oの採取 | 結果上の扱い |
|---|---|---|
| 有効なcomplete_200、既知family／競合 | guard後に1回 | 固定比較器が実測／競合のobserved_atへ同Oを使用 |
| 有効な空200、全null／空文字 | guard後に1回 | 比較入力にはOを含む。operator_config／source:noneの公開evidenceへ新しいobserved_atを足さない。観測なしを実測と偽らない |
| 有効な不完全／未知family／21行sentinel | guard後に1回 | 比較入力のOを固定。公開unknownの既存shapeを変えない |
| binding不一致のnot_requested | 0回、GET=0 | Oなし。設定の不一致を、空200／時計障害へ変換しない |
| decode／projection不正、raw22行等 | complete_200としての採取は0回 | 既存の不正応答境界を維持。後日invalid_observationへ写像する場合もOを捏造しない |
| 非200／native status-only、cleanup未確認 | この200契約では0回 | 既存HTTP／cleanup二軸・legacy catchを維持。200／空配列に偽装しない |

空200でも時計が失敗した場合は設定代替へ進まない。Oが公開evidenceに含まれない分岐でも、採取済みOはprivateな時刻整合の基準として使う必要がある。公開shapeを増やさず、その保持・終了時破棄は後続のowner設計／実装で確認する。

## 5 逆行・例外・先行停止

| 事実 | 将来の固定扱い |
|---|---|
| 時計throw／Invalid Date／ISO化失敗 | 同停止ownerにinternal_review_error。例外本文なし。unknown／observation_unavailable／fallbackへ格下げしない |
| O<S、直前の受理UTCより小さいO | 検出可能な逆行としてinternal_review_error。再採取・Sへの丸め・最大値へのclampをしない |
| O>S+Lだがmonotonic予算は正 | UTCの順序／run区間と整合しないためinternal_review_error。wall-clockだけでdeadline_exceededと偽らない |
| guardが先に取消／close／元deadline／phase deadlineを確定 | 先行理由を保持しO・draftを採用しない。時計例外や比較器invalid_inputで上書きしない |
| 時計callback中に取消等が発生 | 採取後guardで同ownerの先行停止を優先する。時計を再読して成功へ戻さない |

観測点の間で一度戻ってから復帰した時計は、受理値の順序検査だけでは検出できない。monotonicの進行とUTCの増分を等しいものと仮定せず、監視ポーリング／追加clock採取や新しいskew許容値を導入しない。未観測の時計変動を検出済みとは主張しない。

## 6 上位reviewed_at／ended_atとの整合

将来の接続で守る部分順序は、complete_200について**S <= O <= T_i(=reviewed_at_i) <= E**。review対象が0件ならS <= O <= E。各T_iは既存取得順で非減少、Eは全ての受理済みUTC以後とする。取得時刻を解析終了時刻へ変更しない。`record_updated_at`やPDIレコード更新時刻はこのクライアント側の順序系列に混ぜない。

同runのprivate ownerに最後に受理したUTCを保持する案とし、Oが公開evidenceにない空200分岐も含める。上位への移譲は既存のtrusted継続内に限定し、新しい公開watermark／caller入力／権限tokenにしない。保持・workerとの結合・費用は未実装であり、RP-01が既に提供しているとは扱わない。

所有・照合の分担案は次のとおり。Oは同source／sessionに結合したrun ownerが保持し、親orchestratorの固定private継続が参照する。親はT_iを解析へ渡す前に照合し、戻った同jobのreviewed_atが渡したT_iと一致することも確認する。workerは既存schemaで集約を検証するが、空200で公開evidenceにないOまでは知り得ないため、親は同worker jobの最終結果を受理する前に保持O／最後のT_iと返却Eを再照合する。O用のpublic JSON fieldやworkerの新時計採取で穴を埋めない。検証のためのE再採取・書換えもしない。このprivate参照／job bindingは実装レビューで確認すべき差分で、現在のadapterが既に保持しているとはしない。

payload取得UTCを採った後は、既存のreviewed_atの生成規則を維持したままOおよび直前の受理値との順序を確認してから解析へ渡す。集約のEは既存finalizeの1回の値を用い、S <= E、E−S <= L、全reviewed_at <= E、観測済みO <= Eを検査する。workerの時計と親側の時計が自動で同じ順序になると仮定しない。

逆行／先行する観測より古いreviewed_at・ended_atで整合しなければ、その結果を出力せずoutput／analysis等の既存段階と固定internal_review_errorを保持する。S・O・T_i・Eの書換え、結果の日時丸め、観測evidenceの削除、該当assetを黙って落として成績を成立させる救済はしない。mono guardの先行取消／期限は優先する。既存schemaのfail-closedを緩めない。

workerの最終Eは集約生成時の値であり、終了処理後のUTCではない。worker終了・session cleanupまでの元monotonic期限検査をこれで置換しない。D02のteardown確定後に非実行候補だけをwithheldとする挙動と、Rの正式結果を検証前に止める契約も混同しない。

実効Lと出力JSONの宣言deadlineは現状同一とは限らない。将来の接続でも同projectionの実効Lによる検査と既存schemaの宣言値による検査を両方満たす必要があり、宣言値が大きいことを実効期限の延長に使わない。operator_configの集約有効性は既存schemaが宣言値を使う点も含めて別途照合する。fieldの供給統一・互換方針は後続レビューに残し、本書ではfield変更・schema緩和・時刻補正を承認しない。

## 7 fake依存の全体受入条件（OU-01の部分確認は§9）

| ID | 独立に期待する観測 |
|---|---|
| UTC-01 | 通常200／private ackとも、同bytes projection→取得後guard→時計1回→再guard→比較の順。取得後guard失敗なら時計0回、再入／二重要求で採取は増えない |
| UTC-02 | 空200／全空／未知／部分不完全／21行でもOは1回。空200の設定代替・unknownに新しい公開observed_atなし |
| UTC-03 | not_requested／非200／raw22／decode・projection失敗では200観測用の採取0回。GET・C/G/P・cleanupは既存の独立期待値を維持 |
| UTC-04 | O=Sと同msのT_i／Eは許可。O<Sを1msで拒否。O>S+Lをmono生存中に拒否。UTCとmonoの期限等号を独立に確認 |
| UTC-05 | 時計throw／非有限／ISO化例外で固定停止。空200でも設定代替に進まず、raw例外・日時値・秘密を診断に追加しない |
| UTC-06 | 時計中の取消／close／期限と例外が重なっても先行理由を保持。失敗後は再採取・再比較・新Permitを作らない |
| UTC-07 | O正常後にT_iまたはEが1ms逆行したら結果非公開。Oがevidenceに出ない空200も同じ。逆行していない無対象runはO<=Eで成立 |
| UTC-08 | workerが親と異なるUTCを返す場合も、Eと全reviewed_at／Oを照合。既存schema failureを握りつぶさず、期限／取消と診断合流する |
| UTC-09 | 待機／O／T_i／EにかかわらずS／L／Pは同projectionのまま。E=S+L／S+L+1の集約境界、設定expires_at=S+L／S+L+1の厳密境界を別々に確認 |
| UTC-10 | 旧0.2／0.3のfield・limitations順序・公開copyとprivate snapshotを維持。B-03は別processのcompiled試験で別集計、旧実class試験を削除しない |

追加費目はOの一度限り採取・形式／数値比較・privateな最後のUTCと固定guard・copy。タイマーや予算owner、受信量・試行枠は増やさない。全体work／allocation・同期実行上界はUnknownで、上界検証済みに数えない。全60秒・210試行・受信上限・cleanup予約を緩めない。

## 8 承認待ち・今回の確認範囲

上位private UTC保持の所有者／worker境界、観測UTC追加の通常source互換性、全体費目、実source切替は後続レビュー対象。OU-01のfake継続への限定実装は次節へ分離し、本番採用・実通信の承認ではない。

draft-0.1作成時はソース／schema／設計の読取とMD更新・文書参照／差分検査のみだった。RP-01やD01〜03の過去試験結果を本書の受入条件の完了数へ流用しない。worker message・JSON field・公開failure codeはOU-01でも変更しない。

## 9 OU-01の限定実装

[値専用の採取部品](../src/servicenow/review-kernel/release-observation.ts)を追加した。初回状態とS／全L・trusted clock／check／reject参照を生成時に固定し、fresh→samplingをpre-guard前に消費する。guard→同Dateの1読取・epoch／ISO／S〜S+L照合→post-guard→sampledの順とし、失敗はfailed、closeはclosed。失敗後／二度目・caught reentryでもUTCを再読しない。部品自体は値状態だけで、任意のfake依存で作れても実sessionの証拠・Permitにはならない。

[session](../src/servicenow/bounded-read.ts)は既存fixed fake-200継続でRP-01 projectionを一度消費した後だけ採取部品を生成し、時計は固定の`()=>new Date()`とする。checkは同session／source／key・originのS／L／policyと現在値を再照合し、失敗を元停止ownerへ渡す。通常のoptions／tool inputへclock設定口は追加しない。同期失効・finally・rollback／closeで採取部品をcloseして参照を破棄する。

[source](../src/review/bounded-source.ts)の既存creator-only継続へ任意の`observeReleaseUtc` hookを追加した。これは既存private construction keyによる同session生成継続にだけ渡すもので、新friendや公開supplierではない。通常GET／他のstatus継続には渡さない。fakeの同rows projection後のguardに続けてhookを一度呼び、再guard後の既存分岐へ進む。実測／競合は同Oを使い、従来の`new Date()`を追加実行しない。空200・不完全・未知・21行もOを1回採るが、公開evidenceのshapeは変更しない。通常source判定・native／非200の分岐を差し替えたものではない。

今回のnot_requested側はOを新設しない。既存実classのfixed fake transcriptはbinding不一致でもrelease bodyをdispatch済みであり、D03の別開発assemblyのGET=0をこのlaneの保証へ転用しない。raw22／不正行projectionは既存legacy分類（release_not_admitted等）を保ち採取0回。body／cleanup不正はhookへ到達しない。

§7のUTC-01〜06のうち採取順・空200・初回逆行／上界・時計障害・guard・一度限り失敗／closeの部分を新規合成試験で確認する。全受入条件の完了、通常sourceの時計保証、上位T_i／E・空200のprivate UTC保持／worker照合、比較器入力化は未実施。Oは既存fake実測結果には反映するが、空200では後続watermarkとして保持する実装はまだない。[OU-01検証記録](E2E_BEST_PRACTICE_RELEASE_OBSERVATION_OU01_2026-11-01.md)参照。

追加確保は固定採取状態とclosure、1つのDateとISO文字列・固定比較。timer・受信bytes・C/G/P・予約ownerは増やさない。layout／全体work・同期時間の上界は引き続きUnknown。入力・上位時刻の未解決事項を今回の部分成功で確認済みにしない。

draft-0.3のレビュー修正：OU-01の配布検査は`release-observation`の4成果物の存在だけを確認し、他の値kernelと同じ依存・壁時計のAST検査に含めていなかった。importをzodだけに限定し、`new Date`・`Date.now`・fetch／timerを拒否する同じ検査へ追加し、時計は注入依存からだけ読むことを配布物でも確認する。上位設計からの版数リンクも更新した。
