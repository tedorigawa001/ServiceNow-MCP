# WF-B SG-A後：record別strict field契約・固定encoding規則

Version: draft-0.2 / Date: 2026-11-14 / 読取り基準HEAD: `dffbc32` / レビュー修正基準HEAD: `283033e`。

draft-0.1のレビュー修正：回数・式・byte値の誤りはなかった。固定schedule設計§6の「通知throw」等をどのreceipt.state／reasonへ写すかが決まっておらず、FE08／09の期待値が一つに定まらなかった。また§5の`scheduled ≤ entered`に対し、timerが予定より早く発火した場合の扱いが未記載だった。§6に通知結果ごとの写像表を加え、§5に早期入場を待機・再timer・許容幅なしで入場拒否とする候補と、その頻度・誤失敗の可能性がUnknownであることを明記した。回数候補・選択状態は変えていない。

Status: **詳細設計のみ。LOAD6／LOAD7の選択・本field／encoding契約・値域は未承認。** 元のtest 5,000ms・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・Pushは行わない。

親は[固定schedule・slot設計draft-0.2](BEST_PRACTICE_WFB_SGA_FIXED_SCHEDULE_SLOT_ENCODING_DESIGN.md)と[provider／clock・費目所有設計](BEST_PRACTICE_WFB_SGA_PROVIDER_CLOCK_COST_OWNERSHIP_DESIGN.md)。[鮮度・時間配賦設計](BEST_PRACTICE_WFB_SGA_FRESHNESS_HANDOFF_BUDGET_DESIGN.md)の原起点・strict D_parent／D6・inclusiveな返却後100ms候補を変えず、byte計算の入力となる値契約とencoder出力規則を対にする。raw JSON parser、encoder、証拠issuer、保存経路は実装しない。

## 1 対象と非対象・内部参照の分離

対象は同ownerが所有する封印済みrecord値の**非実行な出力契約案**であり、既存wire契約の差替えではない。将来選択済みのtrialについてLOAD6／LOAD7を表す形状を記述するが、現在どちらも選択していない。診断値・serialized ID・同値copyからprivate identity／receipt／claimへ復元する入口を設けない。

内部のopaque参照・writer・grant・claim・実buffer・所有権は出力しない。wireの`trial`／`pin`／`packet`等は同ownerが割り当てる有限の相関labelで、pointer・認証値・信頼承認・内容hashの代用ではない。label一致の純粋検査と、実参照同一性・実体pin・同sessionのprivate検査を分離する。

encoder入口は将来のprivateな封印済み値に限定する。任意の外部object／Proxy／accessor／toJSON／iteratorを汎用serializeする入口を作らない。型宣言だけでそれらを安全に検査・拒否できると主張せず、生成境界・入力hook非実行の実装保証は別の未解決事項とする。

## 2 共通scalarの候補値域

全て本書内の未承認の表現profileで、実clock primitiveや実OS値の採用ではない。値域外を丸め・clip・桁切詰めして通さない。

| 型 | strict値域・表現候補 | 固定出力と拒否 |
|---|---|---|
| Id | ASCII `[A-Za-z0-9][A-Za-z0-9._:-]{0,63}`、1〜64byte | JSON string。path／空白／quote／backslash／制御文字／非ASCIIは拒否。秘密をIDへ変換しない |
| Head | lower hex40文字 | full commitの相関値。内容pinの実施証拠ではない |
| U53 | `0`または先頭非0の10進、0〜9,007,199,254,740,991、最大16桁 | JSON string。先頭0・符号・小数・指数・範囲超過を拒否 |
| U64 | 同じcanonical整数文字列、0〜18,446,744,073,709,551,615、最大20桁 | JSON string。長さだけでなく数値範囲を確認。overflowは拒否、wrapなし |
| Mono | U64の単調時刻ns候補 | `mono_ns_u64`というwire表現案。供給元の単位と同じとは推定せず、根拠付きlossless変換ができなければ受理しない |
| UTC | `YYYY-MM-DDTHH:mm:ss.sssZ`固定24 ASCII、年0001〜9999・有効暦日、秒00〜59 | 相関用のみ。offset違い・可変桁・閏秒表現はこの候補外。時計／UTC取得の追加承認なし |
| F64NonNeg | 非負・有限なFloat64値のbit patternをlower hex16文字で表す案 | sign bit0、非finiteを除外。負の0も拒否。10進丸め・locale・指数表記を使わず、provider値のbit対応確認は別途必要 |
| Pair | exact keys `u,t`、各U64、`t>0`かつ`u≤t` | このkey順。比率表示percentを混ぜない |
| C／N | JSON整数1〜256 | 同値でも別field・別scope。`-0`／小数／指数表記の出力なし |
| Bool | `true`または`false` | truthy変換・文字列化をしない |

内部に128／256-bit演算が必要でも、その途中値を無制限の10進文字列として載せない。Pairの64-bit範囲・元counter・telescoping前提は別の入力検査であり、出力が20桁に収まることだけでは証明できない。

Monoのns候補は実clockを選んだ意味ではない。元のms期限をnsで比較する場合は定数を正確に変換し、加算結果の範囲を確認する。新しい期限を残時間から作らず、量子化・誤差・TのUnknownを0へ置換しない。F64NonNegも新しい値の推定ではなくlossless表現の案であり、比較閾値・metricの意味を変えない。

## 3 値variant・reason・固定診断

`V<T>`は下表のexact key集合を持つ。全field必須、追加key・重複key・null・undefinedを許さない。record全体を一つのok flagに潰さず、各metric／時刻の観測状態を保持する。

| state | exact keys（出力順） | 許すreason |
|---|---|---|
| ok | `state,value` | reason field禁止。valueはTの値域だけ |
| missing | `state,reason` | `not_observed,receipt_missing,dependency_missing` |
| unsupported | `state,reason` | `unsupported_platform,provider_unavailable,clock_unavailable` |
| invalid | `state,reason` | 下記InvalidReasonだけ |
| late | `state,reason` | `sample_late,snapshot_stale,timing_violation` |
| cancelled | `state,reason` | `cancelled` |
| not_started | `state,reason` | `prior_failure,stopped_before_step` |
| not_applicable | `state,reason` | `load6_no_l,not_required` |

InvalidReasonは`field_invalid,counter_invalid,counter_reset,zero_total,scope_changed,topology_unconfirmed,clock_invalid,precision_unconfirmed,capacity,encoding_limit,binding_mismatch,order_invalid,receipt_invalid,timing_unconfirmed`の固定14種案。上表のreason総集合は固定28種で、自由文・raw例外・stack・外部codeを追加しない。個々のfieldが全reasonを使えるわけではなく、§4〜6の原因・到達位置との対応も必要である。

このwireで定義した全V fieldは当該record内で適用対象なので、`not_applicable`は出力しない。LOAD6のL非適用は内部slotとrecord不在で表す。`load6_no_l`／`not_required`は共通内部variant用であり、wireに出れば拒否する。`encoding_limit`等のencoder自身の後発失敗も、封印済みmetricのreasonへ遡及して書かない。

`FirstFailure`はexact `{state:"none"}`または`{state:"set",reason:R,step:FS,op:OP}`。Rは上記reason集合、FSはFS00〜FS14、OPはOP00〜OP19だけとする。最初の理由を後続理由で書き換えず、stepとopは親のcoverage対応表にも整合させる。

FirstFailureのRからは非失敗の`load6_no_l,not_required`と、原因の代用である`prior_failure`を除く。後続slotがprior_failureで閉じられても、先行ownerの具体的な最初の理由を維持する。

`DiagFlags`は次の12 Bool keyをこの順に持つ：`provider,clock,scope,capacity,encoding,receipt,duplicate,cancelled,late,binding,cleanup,timing`。可変理由配列や重複回数分のeventを作らない。flagは観測不足／故障の分類であり、それだけで原因確定・cleanup成功とはしない。

## 4 共通envelope・共通の固定入れ子

全record共通のexact key順は`v,kind,slot,trial,plan,pin,packet,profile`。`v`は文字列`lc_record_draft_1`、`kind`は`header,sample,light,interval,summary,terminal`、labelはId、profileは`LOAD6`または`LOAD7`とする。以後、recordごとのkeyを§5の順で追加する。全recordで共通label・profileが一致しなければpacket不正である。

slotはkind別に`H`、`S0`〜`S5`、`L`、`I1`〜`I5`、`SUM`、`TERM`だけ。LOAD6にはL recordが存在せず、LOAD7ではL recordをちょうど1個置く。sampler内部のLOAD6用L位置はnot_applicableだが、それを第15のwire recordとして出力しない。

先行構築失敗等で共通identityや必須参照を正規に用意できない場合は、架空のId・空文字・仮のpinを埋めて診断recordを作らない。strict値を封印できなかった部分slotと先行Failureを内部に保持し、そのrecordのencodingはnot_attemptedのままにする。早期失敗でも必ず完全なwire packetが作れる保証ではない。

| 入れ子 | exact key順・型 | 関係検査 |
|---|---|---|
| ClockInfo | `ref,domain,representation,error_bound_ns`：Id、Id、固定`mono_ns_u64`、V<U64> | error不明を0へしない。実primitive／精度の証拠はprivate ownerの別検査 |
| Evidence | `static,fake,runtime,approval` | 前3つは`not_checked,consistent,insufficient,failed`、approvalは`unapproved,approved`。相互昇格なし |
| Schedule | `samples,period_ms,pre_records,total_records` | 整数6、1,000、13／14、14／15。profileとの対応をexactに検査 |
| Lights | `n,load,free,total`：V<N>、V<固定3要素F64NonNeg配列>、V<U53>、V<U53> | load順は1／5／15分。両memoryがokならfree≤total |
| Scope | `ref,state`：V<Id>、enum | stateは`unconfirmed,confirmed,changed`。label一致だけでconfirmedを生成しない |
| Counts | 下記9 key、全てU64 | snapshot時点のprefix。計数fieldを省略して0推定しない |
| Custody | `payload,workspace,scratch,terminal`、各enum | `not_created,retained,transferred,cleared,unconfirmed`。値だけからclear証拠を再発行しない |

Countsのkey順は`cpu_getter,light_getter,mono_read,utc_read,sample_visit,delta_visit,encode_attempt,notify_attempt,record_seal`。本schedule候補の上限は順にLOAD6で`6,24,26,6,7680,6400,14,1,14`、LOAD7で`6,28,29,7,7680,6400,15,1,15`。数値はU64文字列で出力する。これらは列挙済み操作の候補で、全命令／全費目の上界ではない。

`mono_read`はSの12回／Lを含む14回に追加clock14／15回を加えた26／29回。nAckとhの関係を二つのclock読取として数えない。SUMはFS07封印前、TERMはFS13封印前のCountsであり、自身のseal／encodingやz_postを未来の成功数として足さない。Countsのphase関係はsnapshotの時点までの実prefixと照合する必要がある。

## 5 record別のexact field契約

以下の「追加key」は共通envelopeの後にこの順で置く。表にないfieldは一律禁止。V<T>を使うkey自体は非ok時も存在し、valueだけがvariantに従って変わる。

| kind／slot | 追加key順・型 | 禁止・局所関係 |
|---|---|---|
| header／H | `source,head,workload,provider,clock,metric,scope,budget_ref,requirements_ref,evidence,arm,schedule` | source／provider／budget_ref／requirements_refはId、headはHead、workloadはP9／P8、metricは固定`cpu_busy_accounting_v1`。clockはClockInfo、scopeはScope、evidenceはEvidence、armはV<Mono>、scheduleはSchedule。h／g／i・receipt結果・最終費用なし |
| sample／S[k] | `index,scheduled,entered,begin,end,utc,cpu_count,cpu_check,lights` | indexは整数0〜5とslot一致。scheduled／entered／begin／endはV<Mono>、utcはV<UTC>、cpu_countはV<C>、cpu_checkはV<固定文字列`validated`>、lightsはLights。raw counter配列・CPU model・busy pairなし |
| light／L | `entered,begin,end,utc,lights` | 各型はsampleと同じ。enteredはnL。CPU count／counter／busyなし。LOAD6でrecord自体禁止 |
| interval／I[k] | `index,left,right,busy` | indexは整数1〜5、left／rightは対応するS[k−1]／S[k]の固定slot文字列、busyはV<Pair>。不正区間にpairを置かない |
| summary／SUM | `entered,interval_states,busy,scope,eligibility,counts_at_seal,first,diag` | enteredはnAのV<Mono>。interval_statesはI1〜I5のstate固定5要素、busyはV<Pair>、scopeはScope、eligibilityは`unknown,ineligible,value_candidate`、残りはCounts／FirstFailure／DiagFlags。h／g／i・通知／最終encoding結果なし |
| terminal／TERM | `receipt,n_notify,n_ack,h,guard,call_entry,sealed_at,attempt,timing,counts_at_seal,first,diag,custody` | receipt・hは§6。n_notify／n_ack／guard／call_entry／sealed_atはV<Mono>でnN／nAck／g／i／z。attemptは`zero,attempted,unconfirmed`、timingは`not_called,within,violation,unconfirmed`、残りはCounts／FirstFailure／DiagFlags／Custody。z_post・TERM encoding成否・最終解放成功・runner終端証拠なし |

sampleの時刻が全てokなら `a + k×1,000ms = scheduled ≤ entered ≤ begin ≤ end` を同domainで検査する。enteredはbSの代用ではない。armが非okならscheduledを計算して補完せずnot_started等にする。Lもentered≤begin≤endを検査する。時刻variantとmetric variantは独立で、metric値が正しくても時刻不足なら起動適合へ使わない。

timerが予定より早く発火し `entered < scheduled` となった場合、本候補は待機・再timer・clock poll・許容幅の導入をせず、FS02の入場拒否として扱う。観測したenteredはok値のまま残し、そのslotのbegin／end／utc／cpu_count／cpu_check／lightsは`not_started`（`stopped_before_step`）、FirstFailureは`order_invalid`・FS02・OP04とする。以後のgetterは行わない。timer判定の時刻源と高分解能monoとの差でこれがどの程度起きるかは未実測であり、正常な実行を誤って失敗させ得る。許容幅や待機を設けるかは別承認の事項で、実行時に緩めない。

cpu_checkの`validated`は局所入力検査結果であり、scope安定性・実provider証拠・承認を意味しない。Scopeのchanged／unconfirmedは隠さない。I[k].busyのokには対応S双方のCPU入力検査・同scope／epochのprivate根拠が必要で、serialized labelだけでは証明不能である。

SUMのbusyがokなら全5 intervalがokであり、pairは同区間pairの和と一致する。区間percentの単純平均・欠測bridgeなし。value_candidateは純粋な値候補に限り、Unknown・正式発行口閉鎖・全体受付無効を解除しない。provider／scope／clock／要件証拠不足なら、数値があっても適合証拠として採用しない。

## 6 receipt・h・終端関係のstrict分岐

Receiptは下表のexact keysとする。全て状態値のsnapshotで、実receipt objectや発行権限ではない。

| receipt.state | exact keys順 | 必須関係 |
|---|---|---|
| not_sent | `state` | notify_attempt=0。h非ok。FS08失敗等で上位受理を補完しない |
| unconfirmed | `state,reason` | reasonは`receipt_missing,cancelled,timing_unconfirmed`のどれか。h非ok |
| rejected | `state,reason` | reasonは`receipt_invalid,binding_mismatch`のどちらか。h非ok |
| received | `state,packet` | packetは同envelopeのId。n_ackがok、hは下記の参照variant |

固定schedule設計§6の通知結果は、次の一つにだけ写す。DiagFlagsとFirstFailureは同じ原因で別途立てる。

| 通知の結果 | receipt | 補足 |
|---|---|---|
| nN guard拒否・先行失敗で通知未試行 | `not_sent` | notify_attempt＝0 |
| 通知の同期throw・失敗settle（receiptなし） | `unconfirmed`／`receipt_missing` | notify_attempt＝1、FirstFailureはOP14。rejectedにしない |
| ack期限到達・応答なし | `unconfirmed`／`receipt_missing` | DiagFlagsのlateも立てる。timeoutを受理へ補完しない |
| 通知中の取消 | `unconfirmed`／`cancelled` | 取消後に届いた応答は重複状態として保持するだけ |
| settleはあったがnAckの採取失敗・順序が検査不能 | `unconfirmed`／`timing_unconfirmed` | receipt内容が正しくてもreceivedにしない |
| 応答はあるがreceiptの形式・内容が不正 | `rejected`／`receipt_invalid` | — |
| 別packet／別trialへのreceipt | `rejected`／`binding_mismatch` | — |
| 同packetへの正規receiptとnAck正常 | `received` | hは下記の参照variant |

hは`V<固定文字列"n_ack">`とし、receivedの場合だけ`{state:"ok",value:"n_ack"}`を置く。hの時刻値は同TERMのn_ack.valueを参照する。別の時計採取も、同値時刻の無制限copyも増やさない。received以外は原因に合う非ok variantで、n_ackがokでもhを自動的にokへしない。

received時に正常時刻が全て揃うなら、最終frame.end≤n_notify≤n_ack≤guard≤call_entry≤sealed_atを検査する。取消等で未到達のfieldはnot_started等とし、全時刻を揃えるために新規採取しない。`within`には必要な時刻・要件・誤差・同ownerの実call対応根拠が必要で、値比較だけのcheckerから実保証を発行しない。

attemptedはcall試行の事実であり、call_entryがokというだけで生成しない。call済みで時刻不明ならattemptedとtiming=unconfirmedを併存させ、zeroに戻さない。zeroの場合のtimingはnot_called、attempt=unconfirmedの場合はtiming=unconfirmedとする。正規の最終guardを通ってcallする経路ではreceivedが必要だが、異常な混入・実行事実を記録する診断で未受理のままattemptedが判明しても、その事実を捨てずbinding等の失敗として保持する。

FS08失敗時もTERMはas-of-zでsealedになり得るが、TERM encodingとz_postはnot_attempted／not_startedのまま**内部slotに保持**する。この内部状態をTERMに自己参照fieldとして追加しない。TERMのsealed値があることを、wireにTERM bytesが存在する証拠にしない。

## 7 固定encoding規則案

1. 入力は同ownerのsealed値のみ。追加key・未知variant・範囲外・関係不正はencoder呼出し前の固定検査で拒否する。source objectの列挙順・prototype・toJSONへ依存しない。
2. 共通key→record追加keyの順、入れ子は本書の表順、arrayは規定のindex順で出力する。実行時のkey sort／dedupで正規化しない。
3. JSON構文はcompactな`{ } [ ] : ,`とstringを囲むquote等の必要な記号だけで、空白・indent・BOMなし。ここで挙げたASCII string値・固定key以外は受付対象外なので、文字列payload内のquote／backslashのescapeやUnicode escapeは生成しない。構文としてstringを囲むquoteは出力する。非ASCIIや制御文字をescapeして救済する方式は本候補では採らない。
4. U53／U64／Mono／Pair成分はcanonical整数のJSON string。JSON numberはindex・C／N・固定Schedule整数だけで、符号・小数点・指数・-0を出さない。Boolはtrue／false。null／undefined／NaN／Infinityなし。
5. loadは固定3要素のF64NonNeg文字列配列。IEEE値を10進文字列へ丸め直さない。0値とmissing／unsupportedを混同しない。表現変換の正しさ・費用は別の合成／実装検証が必要。
6. 1recordはJSON object一つ＋末尾LF1byte。record内部にLFなし。PrePacketはH→S0〜S5→必要なL→I1〜I5→SUMの各lineを連結し、JSON配列wrapper・自由なmetadata・length文字列を追加しない。TERMは別の一度限りlineで、packet受理後のbytesへ追記／再通知しない。
7. record claimはencode呼出し前に一度消費し、throw／部分出力でも再試行しない。出力bufferの失敗prefixを残したまま、次recordやTERMのencodingを開始しない。既存FS08／FS13／FS14の分岐を維持する。

この規則は新しい候補formatであり、標準JSON全般や既存decoderとの互換性を主張しない。将来raw入力を扱うならduplicate key・非canonical token・escape・UTF-8・構造上限を別のbounded parser契約で拒否する必要があり、今回parserや`JSON.parse`／`JSON.stringify`経路を接続しない。

## 8 byte上界計算への入力・未計算部分

本profileは出力をASCIIに限るため、受理されたstringのUTF-8 payload byteはASCII文字数と一致する。quoteを含むstring値の長さは `2 + payload_length`。Id最大64なら66byte、U53最大16桁なら18byte、U64最大20桁なら22byte、UTCは26byte、F64NonNegは18byteとなる。

| 構造 | byte式（候補出力規則の下） | 注意 |
|---|---|---|
| m要素array | `2 + max(m−1,0) + Σ value_bytes` | 長さを固定。load3要素は`2+2+3×18=58byte` |
| n key object | `2 + max(n−1,0) + Σ(2 + key_length + 1 + value_bytes)` | key quote2・colon1・commaを含む。variantごとにkey集合が異なる |
| record line | `object_bytes + 1` | 最後のLFを含む |
| PrePacket | `H + ΣS + [L] + ΣI + SUM` | 各項はLF込み。LOAD6で13line、LOAD7で14line |
| TERM込み | `PrePacket + TERM` | 14／15 LF。buffer／framingの外側metadataは別費目 |

最大byteはokだけでなくreasonの長い非ok variant、FirstFailure／DiagFlags／Evidence／Scope／Custodyと時刻の組を比較して求める。同じrecordの各fieldを独立最大にできるか、局所関係で共存不能かも示す必要がある。証拠・予算のId参照を実内容の保存費0という意味にしない。

今回はbyte式の入力を具体化する入口までで、H／S／L／I／SUM／TERMの全variant最大値・総量・最大同時保持の算出は未完了である。旧25,088／27,136byte・共通32KiBやraw二面20,480byteを再利用して適合済みとしない。ASCII限定でescape費を外せることも、JS string内部表現・encoder一時copy・GC・native allocationの上界証明ではない。

## 9 後続の独立fake／oracle受入案（全て未実施）

| ID | 対照・故障 | 必須条件 |
|---|---|---|
| FE01 | 各recordの必須欠落・未知key・別kind／slot | exact key集合と固定順、profile別L有無を検査 |
| FE02 | okにreason／非okにvalue、stateとreason不一致 | 8状態・固定28 reasonの対応外を拒否。欠測を0にしない |
| FE03 | Id境界64／65、quote／backslash／非ASCII | 不正値をescape救済せず拒否。内部参照へ復元しない |
| FE04 | U53／U64最大・一桁超過・先頭0・指数 | 長さと値域両方を確認。最大22byteのU64 string等を独立計算 |
| FE05 | Mono単位違い・lossy変換・誤差不明、timerの早期発火（entered＜scheduled） | ns表現だけで実clock適合とせずUnknown／停止。早期入場は待機・再timerなしで入場拒否 |
| FE06 | loadの負0・負値・非finite・大小文字違い | 16hex候補の値域・固定3要素。10進丸め／missing補完なし |
| FE07 | summaryの区間不足・pair合計不一致・T=0 | 不正pairを拒否。value_candidateを実受付へ昇格しない |
| FE08 | received以外のh=ok・別packet・nAck二重採取、通知throw／timeout／取消 | 同TERMのn_ack参照だけ。通知結果は§6の写像表どおり一つのreceiptへ。receipt／時刻／実体同一性は分離 |
| FE09 | call済み時刻不明・guard未到達・診断branch | attempted／zero／unconfirmedを保存し、正常受理へ偽装しない |
| FE10 | FS08失敗でsealed TERMだけが残る | 内部値とwire bytesを分離。TERM自己成否・z_postを追加しない |
| FE11 | key順・空白・LF／framing・array順の変異 | 固定token列・58byteのload array等の独立期待値と照合 |
| FE12 | 全recordの旧cap流用・総保持保証への昇格 | 未計算の総byte／同時保持／allocationをUnknownに残す |

oracleは対象encoderのkey列・長さhelper・enum一覧をそのまま再利用せず、独立した契約表・境界値・期待ASCII token列・byte式で照合する計画とする。今回は検証器・fixture・テストを実装／実行していない。

## 10 未承認事項と今回の範囲

- [ ] record別exact field／variant／reason・局所関係のレビュー。
- [ ] Id／数値／Mono ns／F64 hex／ASCII限定・line framing候補の承認。
- [ ] 全variantのrecord別byte最大値・総量・最大同時保持の算出。
- [ ] private入力・実provider／clock・費目coverage・一度限りencodingの検証計画。
- [ ] LOAD6／LOAD7の選択と、実装・合成確認・実確認・保管の個別承認。

全て未承認。選択・値域・formatの採用、旧入口／通常経路の差替え、証拠／permit発行は行わない。本MDと親2文書の参照更新だけとし、元の5秒期限・既定並列度、正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。実装・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・コミット・Pushは今回行わない。

文書整合として対象3文書のローカルリンク12件・表20個（draft-0.2で§6の写像表を加え21個）の列数、FE01〜12の計画ID連番、未承認チェック5項目、共通整数16／20桁・reason集合28種、string最大66／18／22／26byte・load配列58byte・列挙取得62／70の定数式、末尾改行と差分空白を確認した。文書と定数の静的検算のみで、encoder／検査器実装・合成試験・実clock確認・負荷採取・試験再実行・総byte／保持上界の実証ではない。
