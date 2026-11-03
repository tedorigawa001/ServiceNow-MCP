# OB-03前工程：順序付きprefix・固定deltaの詳細契約

Version: br006-recovery-prefix-delta-draft-0.2 / Date: 2026-11-03。
初版基準HEAD: `7866991`。Status: **PD-Aのprefix-local値計算・eligibilityと境界oracleを合成実装。private結合・実accepted header照合・移譲先sealは未接続。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。**

[OD-B設計§4〜6](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_ODB_TRANSFER_DESIGN.md)と[NB接続設計§8・12](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_OB02_ADOPTION_DESIGN.md)の具体化。新しい正規化・上限緩和・seal成功を導入せず、親の原順序と既存plan投影のcanonical値の関係を証明する条件を定める。

## 1 固定する供給元と対象外

| 供給元 | 現行の処理／本稿で固定すること |
| --- | --- |
| [親adapter](../src/review/update-set-adapter.ts)の逐次採用 | findings枠での親省略／元worker省略による警告とoutputエラーの追加順 |
| [OM-A値model](../tests/support/review/synthetic-parent-omission-values.ts) | initial_prefix、親処理後prefix、元行・親traceを保持。初期limitationsは≤100、親中間は≤103、errorsは≤100。重複を除かない |
| [pins生成](../tests/support/review/synthetic-finish-pins.ts)／[RA値検査](../tests/support/review/synthetic-finish-context-values.ts) | 親prefixをbaseとして検査。limitationsのunique／≤100等を要求した後にsortする。errorsをsort／dedupしない |
| [plan投影](../tests/support/review/synthetic-finish-plan-binding.ts) | sort済みbaseからsoft／verify deltaを固定追加し、limitationsのfirst-occurrence dedup、errors先頭100件維持、必要な切詰め警告を経てRA検査／sort |
| [verify合成owner](../tests/support/review/synthetic-worker-recovery-verify.ts) | verifiedな同plan.verifyだけがdeltaの供給元。外部delta配列・caller指定の省略flagは受けない |

本稿の親処理はadapterの逐次採用を再現するOM-Aであり、[finalizeAggregate](../src/review/aggregate-finalize.ts)全体の再実装ではない。後者のfindings再計数・末尾からのwireサイズ省略・最終dedup・終了時計を混ぜない。stage=`output`／code=`response_limit`が同じでも、発生段階と元行／traceを区別する。

正式な実metadata／payload／wire起源、実verify、本文比較、finish job、移譲先seal／正常終端は対象外。NB-01〜03の1〜100行・active retained input・同receipt・0.2／0.3・既存受信／210試行／全60秒の条件は変えない。

## 2 三つのprefixと同一性

prefixは`{limitations: ordered strings, errors: ordered error records}`。以後Lはlimitations、Eはerrorsを表す。

| 記号 | 意味／寿命 |
| --- | --- |
| P0=(L0,E0) | DATAの親処理前。finish.headerとmixed.initial_prefixの値・順序・重複が一致することを既存供給coreで確認 |
| Pp=(Lp,Ep) | 同元行を選択順に処理したOM-Aの親処理後値。traceとともに正常owner→同pending→将来destだけが保持 |
| B=(Lb,Eb) | eligibleなPpを既存pins生成／RAへ渡したbase。Lb=Sort(Lp)、Eb=Ep。LbからLpを復元しない |

stringsはJSの完全一致で比較し、trim・大文字小文字変換・Unicode正規化・locale処理をしない。Sortは既存の引数なし`Array.sort()`と同じUTF-16 code unitの昇順。error recordはoptional fieldの有無を含むstrict field／値一致、配列は順序・重複を含めて比較する。recordのproperty記述順そのものを新たな意味にはしない。

prefixの等号は値と配列順の一致であり、copyを行う既存投影へ配列／error recordそのものの参照一致を新しく要求しない。同owner／receipt／pins／plan等のopaque参照結合は別の条件として維持する。

将来の関係証拠は同construction／同元行・Pp／同pins・CompletedMixedContent／同accepted／plan／handoffへのprivate結合を必要とする。P0やLpを外部summary、別model呼出し、sort済みheaderから作り直さない。文字列配列の一致だけを発行元証拠へ昇格しない。

## 3 親の逐次処理と103の意味

keptを0から開始し、同selected順に処理する。reviewedのincoming findingsで`kept + incoming > 100`なら親省略し、keptは増やさない。それ以外は元outcomeを保持し、reviewedならincomingを加える。省略後でも後続の小さいreviewedが入る場合がある。

| 現在行／既存Lp | 警告の追加順 | error追加の試行 |
| --- | --- | --- |
| 親省略、response_truncatedなし | response_truncated → finding_budget_exceeded | output/response_limitを1回 |
| 親省略、response_truncatedあり | 追加なし | なし |
| 元worker result_omitted、response_truncatedなし | response_truncatedだけ | output/response_limitを1回 |
| 元worker result_omitted、response_truncatedあり | 追加なし | なし |
| その他 | 追加なし | なし |

追加試行時にEの長さ<100なら末尾へ追加する。既存同値エラーがあっても追加する。既に100ならEは変えず、error_details_truncatedがなければL末尾へ1回追加する。

これは条件を独立に「改善」しない。例えばfinding_budget_exceededが既にあってresponse_truncatedがなければ、親省略時にfinding_budget_exceededが重複追加される。また元worker省略が先にresponse_truncatedを追加した場合、後続の親省略はfinding_budget_exceededやエラーを追加しない。どちらも現行adapter／OM-Aとの一致を優先する。

初期L0≤100から増えるのは、最初のresponse_truncated gateで最大2警告と、満杯error時の切詰め警告1件。したがってOM-Aの中間上限は103であり、RAや最終出力の100を拡張する許可ではない。Ppが101〜103件ならmodel値として存在し得るが、次節のRA入口で拒否する。104件の初期入力は初期構造上限で拒否し、偽造した104件の中間値も関係検査のlimitにする。

## 4 RA入口のeligibilityを先に判定する

Ppをdedupする前に、既存pins／RAの全局所条件を満たすことを要求する。特にLp≤100・重複なし・各warning長1〜200と既存nodes／文字量／深さ枠、Ep≤100・対応schemaのstrict errorを維持する。OM-Aはwarning長≤2000や重複を受け得るため、model成功をRA受付成功に読み替えない。

- Lp=101〜103や局所上限超過はlimit／unsupported相当として停止。新しい公開reasonは増やさず、既存の固定内部失敗へ写像する。
- Lpの重複・P0不一致・traceや同元参照不一致はbinding／shape相当として停止。
- 先にdedup／切捨て／sortして受付可否を変える救済は禁止。後段planで指定済みのdedupとは別物である。
- 0.2のcandidate_filter_violation拒否、0.3のstage／sys_id／collection条件等も維持する。schema間でerrorを変換しない。

入口でeligibleとした場合だけBを得る。EbはEpと同じ順序・重複・record fieldを保ち、errorsにunique制約は追加しない。

## 5 固定deltaと二つのlimitations経路

Vは同planのverifiedなverify snapshot。consistencyはstable_observation／changed／unverified。V.limitationsとV.errorsの整合、verify_requiredと同準備入力、no-verify時の元会計不変は既存plan検査をそのまま要求する。

| V.consistency | 合成ownerが生成するV.limitationsの順序 |
| --- | --- |
| stable_observation | [] |
| changed | [provisional_results, changed_during_review] |
| unverified | [provisional_results, consistency_unverified] |

原順序経路では、`Lp → soft_deadline_reached → deadline_exceeded → V.limitationsの元順序`の連結にfirst-occurrence dedupを1回適用し、Loを作る。独立oracleは「左から見て初出だけ残す」走査で定義する。

現行planの実経路は既にsort済みのLbから同じdeltaを追加するため、sort前の配列はLoと必ずしも一致しない。次の二経路を区別して保持する。

- 原順序側: Lp → 固定delta → stable unique → Lo → 必要なら切詰め警告追加 → Lordered。
- 実plan側: Lb → 同固定delta → stable unique → Lplan_pre → 同切詰め警告追加 → RA検査／Sort → Lcanonical。

必要な関係は`Sort(Lordered) = Lcanonical`であり、`Lordered = Lplan_pre`ではない。元ordered laneとcanonical laneを同じslotへ上書きしない。例えばLp=[z,a]、新delta=[soft_deadline_reached,deadline_exceeded]なら、Loは[z,a,soft_deadline_reached,deadline_exceeded]、実plan preは[a,z,soft_deadline_reached,deadline_exceeded]だが、sort後は一致する。

既存のpure plan viewはV.limitationsを必要な集合として検査し、渡された配列順で追加する。新rootの証拠は固定creatorの実snapshotに限定する。oracleの正常系は上表のcreator順を使い、並べ替えた任意pure viewを実ownerの発行証拠とは扱わない。既存pure APIの受理集合を変更する提案ではない。

## 6 errorsの追加順・切詰め・警告

固定追加列Dは次の順。stageとcodeの組を勝手に統合しない。

1. `{stage: analysis, code: deadline_exceeded}`を必ず1件。
2. V.verify_errorがnullでない場合、`{stage: consistency, code: V.verify_error}`。
3. V.consistency=changedなら、`{stage: consistency, code: changed_during_review}`。

V.verify_errorは同ownerで既に正常化された値をそのまま使う。rawなinvalid_response／phase_deadline_exceeded等をこの関係計算器で再マップせず、未知codeや版に合わないcodeは既存error schemaで拒否する。raw取得失敗からVへの分類・retryはverify ownerの責務のままとする。

k=|D|、e=|Ep|とし、追加できるのはDの先頭`min(k,100-e)`件。`Eordered = Ep ++ Dのその先頭部分`、drop数=`max(0,e+k-100)`。順序・重複を保持し、既存errorを追い出さず、後ろから採用せず、dedupもsortもしない。正常な構造入力でe>100は許可しない。

drop>0の場合だけ、Loにerror_details_truncatedがなければ末尾へ1件加え、Lorderedとする。既にあれば位置を変えず、追加しない。drop=0でも既存の同警告は残す。planのstats.errors_truncatedはこのdelta段階のdrop有無であり、警告の存在だけから推定しない。親段階で既に落としたerrorの有無とも分ける。

| e | k=1 | k=2 | k=3 |
| --- | --- | --- | --- |
| 97 | 98件、drop0 | 99件、drop0 | 100件、drop0 |
| 98 | 99件、drop0 | 100件、drop0 | 100件、D先頭2、drop1 |
| 99 | 100件、drop0 | 100件、D先頭1、drop1 | 100件、D先頭1、drop2 |
| 100 | Ep不変、drop1 | Ep不変、drop2 | Ep不変、drop3 |

現行NB rootの固定no-verify profileはV.verify_error=nullなのでkは1（stable/unverified）か2（changed）。verifyありの合成ownerでもエラー解決はconsistency=unverifiedにするため、verify_errorあり＋changedのk=3は現在の正常生成経路ではない。k=3は既存pure投影が構造上処理する保守的境界・値レベルの比較条件としてだけ検証し、新verify発行経路を開く根拠にしない。hard取消／全期限切れをDへ変換して継続することも禁止する。

## 7 100／103境界の判定例

以下のdelta名はLpに未出現、warning文字数等の他条件は適合、Xはerror_details_truncatedを表す。既存重複や既出deltaがある場合は件数の足算でなく§5〜6の逐次規則で判定する。

| 親後／条件 | 結果 |
| --- | --- |
| Lp98、stable、e≤99、X追加なし | +soft2で100、関係検査可 |
| Lp99、同条件 | 101となりplan局所上限拒否 |
| Lp96、unverified/changed、drop0 | +soft2＋V2で100、可 |
| Lp97、同条件 | 101で拒否（既存96／97試験と一致） |
| Lp95、unverified、e=100、X未出現 | +4＋Xで100、可 |
| Lp96、同条件 | 101で拒否。必要警告を落として通さない |
| Lp100 unique、必要deltaとXが全て既出 | 新規追加0なら100を維持し得る。他条件も検査 |
| Lp100だが重複あり | delta後に100以下へ縮んでも入口で拒否 |
| L0=100、e0=100、response_truncated／Xなし、親省略 | 親後103はOM-A範囲内、RA入口で拒否 |
| Lp101／102／103 | 同様にRA入口拒否、100へ切り詰めない |

error上限100とwarning上限100は独立である。E=100であること自体は拒否条件ではないが、必要なXでLが101になれば拒否する。どちらかの枠を他方へ流用しない。

## 8 privateな関係検査と未供給項目

将来の内部関係値（名称案OrderedPrefixRelation）は、同P0／Pp・traceへの参照、同pins base、同plan／accepted origin、原順序側prefix、固定deltaの採用／drop件数、canonical一致結果を同claim内で束ねる。一般のprefix／delta／acceptedを登録するfactoryやgetterを設けない。値計算成功だけでは移譲・seal authorityにならない。

現在のNormalAcceptedSnapshotはpins／plan／handoff／route等を持つが、実accepted projectionのheader参照は返していない。OB-03前に、同constructorのprivate継続がその実headerとの比較を内部で行うか、同takeへ束ねるprivate projection receiptを追加する必要がある。別呼出し・summaryや仮routeで投影を再生成して「実accepted header」とみなさない。公開snapshot／body getterを追加しない。

[実accepted header供給境界](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_ACCEPTED_HEADER_SUPPLY_DESIGN.md)で二案を比較し、同takeへprivate receiptを束ねる案を合成実装した。対象はaccept後の同projectionで、take後の再読・再生成はしない。固定consumerと失効時破棄までを接続し、PD-A入力のprivate結合・内容比較・sealは未実装のまま。

関係計算は同pendingを所有する保護scopeに限定し、pre／work／postと同失効serialを結ぶ。workのshape／limit／不一致は一時失敗に留め、postのcancelled／deadlineを優先する。失敗時は関係値・ordered/canonicalの一時コピーも破棄し、NB-03の本文破棄証拠・固定診断／同custodyへ進む。diagnosticは固定reasonと件数だけでprefix本文・rawエラーや行IDを出さない。

## 9 独立oracleの検証条件

oracleは被検査のmodel／plan投影／関係計算器／finalizeAggregateを呼んで期待値を作らない。既存fixturesはstrict入力の雛形としてだけ使用できる。期待する親分岐・delta順・残るerrors／dropと拒否段階は、手書きの表と別表現の逐次状態機械で作る。stable dedupには線形既出リスト、sortにはUTF-16比較の独立挿入順計算を使う等、実装のSet＋sortをそのまま複製しない。

必要な検証を以下に固定する。PD-Aで実行した値検査と、PD-B以降に残るorigin／寿命の範囲は§11で区別する。

| 群 | 必須ケース／比較対象 |
| --- | --- |
| 親原順序 | findings [99,2,1]のkeep→omit→keep、繰返し親省略、worker omitted先行／後行、既存response_truncated／finding_budget_exceededの有無、initial警告重複。各traceの増分とPpを完全比較 |
| eligibility | L0/Lpの99/100/101/102/103、偽造104、重複とdelta既出、warning長200/201、既存nodes／文字量枠。OM-A可／RA入口拒否／plan拒否を混同しない |
| 二経路 | unsortedなLpとsort済みB、同集合だが原順序違い、重複位置、validな非ASCII文字列のUTF-16順。orderedは違いを保持しcanonicalだけが一致 |
| delta | 3 consistency、既出soft／V警告、verify_errorの合法variant、pure-only k=3、creatorに到達不能な組。同V参照／順序と固定Dを完全比較 |
| errors | §6のe×k全表、既存同値エラー、既存Xあり/なし、親段階dropとplan段階dropの組合せ、optional sys_idの有無、順序を1件だけ交換した不一致 |
| 複合上限 | §7の96/97・95/96境界、100 errors＋新規XでL上限越え、X既出で追加0。必要警告の削除・追加dedupによる救済を負の対照にする |
| 版 | 0.2／0.3で同じ配列規則、candidate_filter_violationの版／stage／sys_id条件、0.3削除行等の従来拒否を維持 |
| origin/寿命 | 別receipt／pins／plan／accepted、コピー／summary、二重claim、失効／guard throw／swallowed再入を拒否。post停止がwork不一致より優先し、dest成功0とfirst診断を保持 |

変異の負の対照として、dedupの前倒し、last-occurrence保持、locale sort、errorsのsort／dedup、100件到達時点でXを誤追加、親省略ごとにerror追加、worker省略へfinding警告追加、Xを追加しない／二重追加、原順序laneのcanonical上書きを検出する。境界受理数だけでなく配列全体と拒否段階が違うことを要求する。

値レベルのoracleにboundedに列挙する入力と、実creatorが発行できる合成経路の試験を分離する。空行・verifyあり・k=3等の純粋境界成功を、現行normal rootの受付条件拡張へ昇格しない。例外／停止の検査で期限を緩めない。

## 10 費目・次の実装範囲と未確認事項

P0／Pp／traceは既存ownerが保持し、追加のordered／canonical一時配列・delta最大3 errors・比較／sort作業・private receiptの寿命とcopyピークを別費目にする。warning／error件数の局所上限は有限でも、全work・heap・中断粒度の数値上界や予約額は未導出。既存予算leaseを更新せず、無料扱い・旧FB-03費目の流用・全体受付有効化はしない。

PD-A（値だけの二経路計算／eligibility・境界oracle）は§11で実装した。次はPD-B（同pending／実accepted projectionへのprivate結合・guard／破棄）とする。どちらも移譲先sealの成功を返さない。移譲先ownerのatomic commit／正常terminal-only寿命と、保持量／全work上界の設計は別途必要。

draft-0.1はMDだけ。後続PD-Aも実接続・実通信・実機操作・token／permit／seal発行・設定変更・Pushは行わない。

## 11 PD-Aの実装範囲

[synthetic-prefix-delta](../tests/support/review/synthetic-prefix-delta.ts)に`projectSyntheticPrefixDelta`を追加した。package除外の値専用helperで、lifecycle／owner／claim／clockをimportせず、既存normal rootやplan投影へ接続しない。成功はprefix-localの計算だけを示し、発行元・P0／traceとの対応・full header適合・同accepted header一致の証拠ではない。

strict DATA契約は次の6項目。extra引数・未知field・accessor・Proxy・疎配列・特殊prototype・unsafe値を拒否し、失敗は固定`internal_review_error`と固定phase／reasonだけを返す。

| 項目 | 値 |
| --- | --- |
| kind／model_id | synthetic_prefix_delta_v1／ordered-prefix-delta-v1 |
| schema_version／collection_status | bp-mcp-review-0.2または0.3／completeまたはfailed。candidate_filter errorのprefix-local条件に使用 |
| parent_prefix | 親処理後のlimitations／errors。P0や本文・行・traceは入力しない |
| verify | stage=verified、verify_required、consistency、verify_error、limitations、errorsの6項目のみ。accountingやoriginの検査は未保証 |

一つのcopy budget（depth≤4、object keys≤8、array≤103、nodes≤2,500、character units≤650,000、文字列とkeyのUTF-16長×3）でDATA全体をsnapshotする。各fieldで枠をresetしない。schemaで親warnings≤103／各長≤2000、errors≤100、verify warnings≤100／各長≤200、verify errors≤2等を検査した後、prefix-local eligibilityで親warnings≤100／各長≤200／uniqueを要求する。103を通すのは入力値の検査までで、受付や出力上限を拡張しない。

成功値にはchecked version／collection、親prefix、sort済みbase、ordered、plan pre、canonical、固定delta、採用／drop件数を別々に保持する。配列・recordは深くfreezeし、callerをfreezeせず後からの変更も反映しない。2経路の算出上の一致は確認するが、外部の実accepted headerは比較していない。

error schemaは候補errorを含む全入力・deltaを切詰め前に検査する。100件で落ちる予定の未知code／版不適合codeも隠さず拒否する。これは新しいstrict DATA境界であり、legacy pure plan viewの不正入力処理を変更するものではない。verify値の整合は既存pure投影の規則に合わせ、warningは必要集合と一意性、errorsは必要なcode順を検査する。任意viewや到達不能なk=3の値成功はcreator証拠ではない。

`usage`は入力snapshot時のnodes／character units／最大depthだけ。schema検査・merge／sort・出力copyのworkや全heapは計上しておらず、全体予算やcapへのprojectionではない。pre/post guard・取消・失効・one-shot claimは追加しない（PD-Bのprivate owner責務）。

[PD-A検証記録](E2E_BEST_PRACTICE_PREFIX_DELTA_PDA_2026-11-03.md)では、独立した線形既出リスト／UTF-16挿入順oracle、親の残findings枠による別状態機械と手書き表、実OM-Aとの値比較、境界・厳密入力・変異の負の対照を確認する。runtime用の配布物や正式発行口へ昇格せず、既存0.2／0.3・受信／210試行／全60秒・Unknownの扱いを維持する。
