# WF-B SG-A後：鮮度要求・L取得所要時間・起動までの時間配賦

Version: draft-0.2 / Date: 2026-11-14 / 読取り基準HEAD: `cb3c871`。レビュー修正基準HEAD: `72806c2`。コミット前の親文書整合確認基準: `4066e48`（LOAD6の実read開始基準）。

draft-0.1のレビュー修正：記述の誤りはなかった。§5の入場判定がstrictの親期限とinclusiveの鮮度期限だけを挙げ、LOAD6のstrictな鮮度期限D6の扱いを書いていなかったため、D6もstrictで判定し、`D_parent ≤ D6`から親期限の判定に含まれることを明記した。条件・配賦例・選択状態は変えていない。

Status: **詳細設計のみ。LOAD6／LOAD7の選択・要件値・配賦値は未承認。** 元のtest 5,000ms・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・Pushは行わない。

親は[6点案・7frame案の比較§3〜7](BEST_PRACTICE_WFB_SGA_LOAD_PROFILE_COMPARISON.md)と[開始時負荷採取設計§4〜7](BEST_PRACTICE_WFB_SGA_START_LOAD_CAPTURE_DESIGN.md)。[外側時間枠設計§4.3](BEST_PRACTICE_WFB_SGA_TERMINATION_OUTER_BUDGET_DESIGN.md)の起点・strictな6秒未満条件を保持し、①鮮度要求と③取得から起動までの費用配賦を対にする。以下の式は将来の受付条件案で、所要時間の実測・最悪時間保証ではない。

## 1 要件を分離してから選択する

| 要件軸 | LOAD6の既存候補 | LOAD7の既存候補・不足 | 今回の扱い |
|---|---|---|---|
| CPU busyの窓 | S0〜S5、nominal 5秒・5区間 | 同じ。Lでcounterを再読しない | 起動時刻基準のrolling窓へ変更しない。実span・S5後のlagの許容は未承認 |
| light値の供給元 | S5のload／N／memory | 別Lのload／N／memory | 同trialの固定供給元のみ。両案のfieldを混ぜない |
| 予定S5からの遅れ | 起動まで1,000ms未満 | 同じ親枠内にLも収める | 取得終了を起点にさらに1秒を与えない |
| 取得終了後の古さ | 1秒枠から導かれる範囲 | L返却後100ms以下の候補 | 全fieldのデータage100msとは同義でない |
| データageの上限 | 親の既存候補は実read開始から1,000ms未満。親起動枠も併用 | Lの所要時間上限と返却後費用の和が必要 | 追加の上限Aは未承認。100ms／150msを自動採用しない |

先に確認するのは「nominal CPU窓とlagを許すか」「light値についてどのageをどこまで許すか」である。起動直前100msまで更新したCPU busyが必要なら、両案とも不足し、本書でどちらかへ誘導しない。取得所要時間や受理費を調べるための実採取も、要件未確定のまま開始しない。

## 2 同一clock domainの時刻・同一性

時刻差は同じ親の単調clockでのみ計算する。UTCは相関用で、deadlineやageの根拠にしない。値は有限・非負で、逆行・不明な単位・異domain・演算範囲外を拒否する。時刻値があってもclockの粒度・精度・providerの真正性は別のUnknownである。

| 記号 | 境界 | 所有・意味 |
|---|---|---|
| a／p | arm時刻／予定S5時刻 `p = a + 5,000ms` | TrialOwnerが一度固定。後続eventで更新しない |
| b5／e5 | S5 getter群の直前／直後 | CPU・light getterを囲む区間。各fieldの内部取得時点は特定しない |
| bL／eL | L getter群の直前／直後 | LOAD7だけ。load／N／free／total、相関clockを含む固定取得区間 |
| h | 固定の上位受理完了 | 同trial／pin／profile／snapshotのprivate receipt確認点。送信完了とは別 |
| g | 最終guardの観測時刻 | 固定pin・停止・同一性・時刻述語と残るtail予約を検査する点 |
| i | 固定spawn APIの呼出し試行入口 | 本書の `t_spawn` の判定対象。子のready／実CPU実行開始時刻ではない |

LOAD6では `a ≤ p ≤ b5 ≤ e5 ≤ h ≤ g ≤ i`、LOAD7では `a ≤ p ≤ b5 ≤ e5 ≤ bL ≤ eL ≤ h ≤ g ≤ i` を必要とする。異なるrun／trial／profileのframe・receipt・時刻copyを足し合わせない。LOAD6にはbL／eLを作らず、欠測をゼロ時刻にしない。

`span(F) = eF − bF`、`return_age(F) = i − eF`、`data_age_upper(F) = i − bF = span(F) + return_age(F)`とする。全fieldがこの取得区間内で読まれること自体が前提であり、cache元の更新時刻やOS内部反映の遅れまで測定した値ではない。ここでの「データage」はAPI読取境界による上界候補であって、OS状態の絶対的鮮度の保証ではない。

予定時刻と実取得開始は別fieldとする。Lは固定順序上S5集計後の一度限りの取得であり、独立した第7のCPU予定点でも、結果を見て動かせる予定時刻でもない。

## 3 固定scheduleと費目の分割

先行slot・pin・容量予約はarm前に準備する。arm後は固定S0〜S5、同counter差分・5秒集計、LOAD7だけL、一度限りの保持／上位受理、最終guard、既存起動chainという順序案を維持する。中間frameの費用は各sample間にも存在し、最後の1秒だけを検算して前半の費用を充足済みとしない。

| 費目 | 区間／上界記号 | 内容・権限 |
|---|---|---|
| S5開始遅れ | `j = b5 − p`、候補上界J | scheduling遅れ。遅れをS5の予定更新で消さない |
| S5取得 | `s = e5 − b5`、上界S | 固定getter・前後clock・UTCの取得区間。同期getterの中断保証ではない |
| S5後の前処理 | LOAD7の `q = bL − e5`、上界Q | S5検査・残差分・busy集計・L前準備と介在遅延 |
| L取得 | `l = eL − bL`、上界Lmax | 固定4 OS getter・clock群。実費上界はUnknown |
| 最終frame後の処理 | `r = g − eF`、上界R | 残projection・検査・encoding・保持・receipt確認・guardまで。待機・scheduler遅れも除外しない |
| guard以降のtail | `t = i − g`、上界T | 最終述語検査の残部・固定callへの受渡し・介在遅延。別のawait／通知／採取／再pinを挟まない |

LOAD6はF=S5で、S5後の全集計・encoding・上位受理をRへ含める。LOAD7はF=Lで、CPU集計等をQへ、Lの検査・最後のencoding／受理をRへ含める。同じ操作をQとRへ二重計上したり、どちらからも落としたりしない。getter数差だけからQ／R／Tを推定しない。

S0〜S4の結果を事前に検査・encodingするなら、各1秒区間の固定費と残る予約を別に示す。L後へ重い全frame再走査を隠して100msだけの軽量経路と称さない。receiptの発行側で行う処理・queue待ち・通知throwもRの範囲に含める。

## 4 要件と配賦の必要不等式

### 4.1 LOAD6

実時刻で `i − p = j + s + r + t < 1,000ms`、従って `a + 5,000ms ≤ i < a + 6,000ms` が必要。親レビュー`4066e48`で明記された鮮度条件は、予定時刻ではなく実read開始を基準とする `data_age_upper = i − b5 = s + r + t < 1,000ms` である。`b5 ≥ p`と親起動枠からこの鮮度条件も導けるが、意味の異なる二つの条件として保持する。さらに狭いデータage上限A6を要求するなら `s + r + t ≤ A6` も必要で、既存の1秒条件を満たすだけで任意のA6を満たしたとはしない。

予約では `J + S + R + T < 1,000ms`、必要なら `S + R + T ≤ A6` を満たす配賦を事前固定する。親の6点候補へJ=100ms未満・S=50ms以下を採用したわけではない。これらを共通品質条件とする場合は、別途明示的に承認する。

### 4.2 LOAD7

実時刻で `i − p = j + s + q + l + r + t < 1,000ms` が必要。同時に現行候補の `return_age(L) = r + t ≤ 100ms` を必要とする。L自体の上限をLmaxとするなら `l ≤ Lmax`、さらにデータage要求A7を置くなら `l + r + t ≤ A7` が必要である。

予約では `J + S + Q + Lmax + R + T < 1,000ms`、`R + T ≤ 100ms`、必要なら `Lmax + R + T ≤ A7` を全て満たす。Lmax=50msを補完候補とするだけではA7=100msを導けず、返却後100msを使い切る配賦なら得られるのは150msまでである。データage100msが必要なら、Lと返却後経路を合計100ms内に配賦し直す必要がある。

等号は区別する。起動の6秒境界／予定S5後1秒境界はstrictで一致を拒否し、返却後100ms・選択したspan／データage上限は候補契約のとおり以下を受理側とする。clockの量子化や測定誤差で境界を保証できなければUnknownとして拒否し、表示丸めで受理しない。

### 4.3 検算用の配賦例（承認候補の選定でも実費見積りでもない）

下表は式の両立／不成立を説明する**定数だけの例**で、runtime値・採用推奨・完了時間保証ではない。実装前に各操作と費目coverage、上界根拠をレビューし、必要な個別検証の承認を得る必要がある。

| 例 | J／S／Q／Lmax／R／T（ms） | 1秒枠合計上界 | 鮮度の検算・限界 |
|---|---|---|---|
| E6 | 100／50／対象外／対象外／600／50 | 800ms、strict 1,000ms未満 | S5 data ageは700ms以下。任意の100ms要求を満たさない |
| E7-R | 100／50／650／50／70／20 | 940ms、strict 1,000ms未満 | L返却後90ms、data age140ms以下。A7=150msには収まるがA7=100msには不足 |

J=100msは例の保守的な配賦幅で、S開始遅れの既存候補 `j < 100ms` の等号を許可しない。E6／E7-Rの余り200ms／60msも追加L・再試行・別費目へ自動配賦しない。例が数学的に収まっても、getter・受理・schedulerの実時間がこの配賦へ収まる証拠はない。

## 5 絶対期限・残る費用の受付

`D_parent = a + 6,000ms`を一度固定する。LOAD6の既存鮮度候補は別のstrict期限 `D6 = b5 + 1,000ms` である。`b5 ≥ p`なので `D_parent ≤ D6`となり、両方の制約下では親起動期限がより早いか等しいが、両者を同じ起点と記録しない。LOAD7はさらに取得後 `D_return = eL + 100ms`、追加のデータage要求が別途選択された場合は両案とも `D_data = bF + AF` を同frameへ結合する。追加要求はLOAD6の既存strict条件を置換しない。相対残時間から新しいdeadlineを作らず、起点・上限・strict／inclusive種別を保持する。

各段階への入場では、観測時刻nとその後に残る固定費用予約を使い、親のstrict期限には `n + B_remaining < D_parent`、inclusive鮮度期限には `n + B_remaining ≤ D_fresh` が必要という案とする。LOAD6のD6はstrictな鮮度期限なので `n + B_remaining < D6` で判定する。`b5 ≥ p`から`D_parent ≤ D6`が成り立つため、親期限を満たせばD6も満たすが、記録では二つの判定を別fieldに残す。L開始前にはLmax・R・Tを先取りし、eLで残時間を見てL上限・R・Tを膨らませない。残る必須操作費が未導出なら「余りがある」とみなさず、実行許可を閉じたままとする。

最終guardもTを含めて判定する。単に `g < D_parent`／`g − eL ≤ 100ms` を確認するだけでは、call試行入口iが期限内にある証明にならない。成功receiptだけで最終guardを省略せず、別ownerの停止・pin失効も再確認する。

これらは事前受付と観測時の拒否条件であって、非割込み可能な同期getterやschedulerの進行を制御する機構ではない。deadline timerの発火前でもnが枠外なら拒否する。arm・最終frame・clockを採り直して期限を延ばさない。外側の観測120秒・cleanup30秒候補の予約を起動前経路へ流用しない。

## 6 最終guardと実callの隙間・停止

固定の同期call境界でも、同一threadが途中で停止されない実時間保証は未確認である。`awaitなし`だけをTの上界証拠にしない。親から渡せるdeadlineとnative呼出しの取消性・線形化点は未接続であり、実process操作の権限も本書から与えない。

| 判明した位置 | 固定の扱い | 保持責務 |
|---|---|---|
| call前に必須値不足・予約不足・期限到達・停止を確認 | spawn試行0。後続getter／L／試行を開始しない | 最初の理由・取得済みprefix・missing・未受理責務 |
| 同期getter開始後に停止、復帰時に超過 | その値はlate。受理して再開せずspawn試行0 | 取得span・停止理由・late値の有限診断。即時中断成功とはしない |
| guard後〜call入口の遅延が期限を越え、call前に確認可能 | 固定callを拒否しspawn試行0 | guard成功と最終拒否を別fieldに保持 |
| call済みで時刻超過が判明、またはcall入口時刻を確認できない | 起動適合とはしない。call済み／試行有無未確認を0へ書換えない | `timing_violation`／`timing_unconfirmed`候補と親終了ownerへの責務。所有・承認済みcleanupだけ |
| clock異常で前後関係を証明不能 | 有効なageを捏造しない。新規試行なし | 最初の理由・最後の正常時刻・未確認対象を保持 |

既存の「鮮度不足ならspawn 0」はcall前拒否できた場合の条件であり、呼出し済みの事実を遡って取り消す意味ではない。Tの根拠・call入口との対応が未確認なら、候補profileの起動前適合を実証済みとしない。子のready通知で起動時刻iを後付けしたり、子clockを親clockから直接減算したりしない。

## 7 費用・計数・有限保持への接続条件

比較書のLOAD6 48回／LOAD7 55回はframe取得のlogical getter／clock回数であり、上位受理・境界guard・call入口の観測まで含む総操作数ではない。本書のh／g／i等を記録するための追加clock・固定field・検査・encoding費は別途必要で、回数差7だけを総費用差としない。将来は取得費・演算費・境界観測費・上位受理費を列挙したcoverage表で無計上と二重計上を拒否する。

観測点を無制限event列にせず、既存header／frame／summary／terminalの有限fieldへ収める案とする。ただし比較時の14／15record、25,088／27,136byte、共通32KiBは以前のfield配賦の仮定である。追加field込みのstrict schema・byte上界の再検算なしに、そのまま十分と主張しない。raw CPU二面20,480byteとJS／native allocation上界のUnknownも維持する。

全時刻・予約・理由は同TrialOwner／pin／profileへ結合する。通知throw・ack欠落・部分生成・容量不足では、元slotを受理済みとせず、最初の理由と解放未確認責務を保持する。正常receipt後も起動鮮度は別検査で、失効済みframeや別trial receiptを再利用しない。保持先・保持期間・最終custodyの未承認事項を今回埋めない。

## 8 必要証拠と未承認事項

| 確認項目 | 選択前に整理すべき根拠 | 現在の状態 |
|---|---|---|
| 要求 | nominal CPU窓・lagの許容、light値のage種別・上限 | 未承認。LOAD6／LOAD7とも未選択 |
| provider／clock | 固定内容・scope／epoch・読取区間・精度と誤差 | Node／依存pin設計に接続する必要。実確認なし |
| Lmax／各費目 | 操作coverage・受付上界・非中断操作とTの限界 | 実費Unknown。表の配賦例は証拠ではない |
| 容量・所有 | 追加時刻field込みschema・同receipt・失敗時custody | 再計算・接続未実施 |
| 受入 | 下記独立対照と、実費確認を行う場合の別承認計画 | 計画のみ。実装・採取・試験なし |

- [ ] CPU窓・lagとage種別／上限の要件承認。
- [ ] Lmax・J／S／Q／R／Tとstrict／inclusive条件の配賦承認。
- [ ] 同provider／clock・誤差・未対応時の扱いの確認方針。
- [ ] 境界観測を含む費目coverage・容量・保持責務のレビュー。
- [ ] profile選択後の親子統一と、実装／fake検証／実採取の個別承認区分。

候補選択と実行許可は別である。要件に合わない方を除外できても、残った方の費用・停止・保持証拠が足りなければ未選択のままにする。実費確認のために採取が必要となった場合も、目的・対象・容量・終了確認・保管の別承認を先に整理し、今回のMD作成をその承認として使わない。

## 9 後続の独立fake／oracle受入案（未実施）

| ID | 入力・故障 | 必須の判定 |
|---|---|---|
| FH01 | 同じS0〜S5へLだけ追加 | CPU busy窓・pair不変。light値の供給点だけが変わる |
| FH02 | L span50ms・返却後100ms | data age150ms。返却後100msをdata age100msと判定しない |
| FH03 | 予定S5後999／1,000／1,001msのcall入口 | 親strict条件の等号以上を拒否。取得終了基準へ起点を移さない |
| FH04 | L返却後99／100／101ms、別途data age境界 | inclusiveとstrictを混ぜず、同時に必要な全述語を検査 |
| FH05 | E6／E7-Rの定数配賦・単一費目の超過 | 800／940ms等を独立加算。余り流用・上限の事後拡大なし |
| FH06 | gは期限内だがTを加えると枠外 | call前受付を拒否。gだけの判定を負の対照にする |
| FH07 | guard後の遅延、call前確認あり／call済み／時刻不明 | 試行0・試行済み・未確認を区別。違反を成功／0回へ丸めない |
| FH08 | 同期getter途中取消、late復帰、clock throw／逆行 | 再開・再sample・再起点なし。先行理由と未確認責務保持 |
| FH09 | receipt遅延／throw／欠落・別trial混入 | Rへ費用を含め、保持確認と鮮度を分離。未受理slotを残す |
| FH10 | 前半sample費・追加時刻field・境界clockの計上漏れ | 最後の1秒／55取得／旧32KiBだけで全費用充足と判定しない |
| FH11 | 別clock domain・単位・量子化で境界不明 | 推定補間・丸め受理をせずUnknown／停止 |
| FH12 | 別profile・結果後fallback・deadline再計算 | 固定profileと原起点を維持。通常5秒・既定並列度へ変更なし |

oracleは候補実装の残時間helperを再利用せず、固定の境界時刻・区間和・述語の真偽を独立に与える計画とする。これらは有限イベントの計画であり、テストコード・負荷採取器・実process対照を実装／実行したものではない。

## 10 今回の範囲

本MDを作成し、親2文書へ参照だけを追加する。LOAD6／LOAD7やLmax・A6／A7・配賦例を採用せず、親の時間枠・取得数・容量を上書きしない。実装・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・Pushは未実施。元の5秒期限・既定並列度、各閉鎖条件・全体受付無効・Unknown・調査保留を維持する。作成時点でコミットも未実施。

文書整合として対象3文書のローカルリンク13件・表17個の列数、FH01〜12の計画ID連番、未承認チェック5項目、800／940msの配賦例・700／140／150msのage等の定数式、末尾改行と差分空白を確認した。これは文書と定数の静的検算のみで、合成試験・負荷採取・試験再実行・所要時間や費用上界の実証ではない。

## 11 後続のprovider／clock確認・操作費目所有（2026-11-14）

[provider／clock確認契約・操作一覧と費目所有draft-0.1](BEST_PRACTICE_WFB_SGA_PROVIDER_CLOCK_COST_OWNERSHIP_DESIGN.md)で、静的整合・合成確認・実確認・承認を分離し、provider／clock確認matrixとOP00〜19の費目ownerを対応付けた。48／55取得の外にある境界clock・通知・encoding等の未導出費と追加field込みの容量上界はUnknownのまま残す。案の選択・実装coverage完成・実費の実証ではなく、元5秒・既定並列度・各閉鎖条件・調査保留と実装／採取／再実行未実施を維持する。

## 12 後続のrecord確定・固定encoding配置（2026-11-14）

[固定schedule・最小field／slot形状・encoding確定点draft-0.1](BEST_PRACTICE_WFB_SGA_FIXED_SCHEDULE_SLOT_ENCODING_DESIGN.md)で、起動前PrePacketを封印してから通知する境界と、h／g／iを含む後続TERMを分離した。全PrePacket encodingを最終Rへ置く案は未承認・実費未確認で、L返却後100msに収まる保証ではない。TERMの自己成否を再encodingせず先行ownerへ保持し、strict D6を含む原期限・選択未承認・各閉鎖条件・Unknown・調査保留を維持する。実装・採取・再実行は行わない。
