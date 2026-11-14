# WF-B SG-A後：開始時負荷採取・CPU busy・有限保持

Version: draft-0.2 / Date: 2026-11-14 / 読取り基準HEAD: `fe6db9a`。レビュー修正基準HEAD: `3e04b5c`。

draft-0.1のレビュー修正：§3.3の「unsigned 64-bitに収まる」の根拠を補った。5秒合計の上界は区間ごとの上界の和では2^64を超えるため、累積counterの差分の和が`x[S5] − x[S0]`に等しいことに依拠すると明記し、その前提が使えない実装では128-bitで集計すると定めた。6点案と7frame案の選択は引き続き未決であり、本修正では扱わない。

コミット前の整合注記：先行する`9063def`では、親の現行候補を「6点の最後S5が起動直前snapshot、古さ1,000ms未満、追加sampleなし」と定義した。本書の別Lを含む7frame・鮮度100ms案は**同じprofileではなく、未承認の代替候補**として保持する。今回どちらかを採用したり親の6点案を上書きしたりせず、実装前にprofile選択と親子の条件統一が必要な未解決事項として残す。以降の7frame・55取得・容量配賦は本書の代替候補についての計画値である。

Status: **詳細設計のみ。数値・供給profileは未承認候補で、実装・負荷採取・試験再実行は未実施。** 元のtest 5,000ms・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実process対照・実接続・実通信・設定変更・Pushは行わない。

親は[通常並列対照計画§5・9](BEST_PRACTICE_WFB_SGA_PARALLEL_TIMEOUT_CONTROL_PLAN.md)と[終了確認・外側枠設計§4〜7](BEST_PRACTICE_WFB_SGA_TERMINATION_OUTER_BUDGET_DESIGN.md)。依存・取得codeの本人性は[依存pin設計](BEST_PRACTICE_WFB_SGA_DEPENDENCY_PIN_CONFIG_DESIGN.md)へ従う。本書は**起動前の負荷**だけを対象とし、実行中のrunner／workerのCPU・RSS採取は別の未接続境界として残す。

## 1 計測対象・静的根拠と限界

記録するCPU busyは、Nodeが公開するhost-visible CPU累積時間の5bucketに限定した会計比率 `cpu_busy_accounting_v1` とする。OSのGUI monitorのCPU%、process単体のCPU%、quota消費率・hardware占有率とは同一視しない。load averageもCPU busyへの代用品ではない。

今回、ローカルの`node_modules/@types/node/os.d.ts`をテキストとして読んだ。CpuInfo.timesはuser／nice／sys／idle／irqをmillisecondsとして宣言し、loadavgは1／5／15分、cpusはlogical CPUの配列、availableParallelismは別の見積値と記述する。型定義はWindowsのloadavgが常に0であること、CPU情報が空の場合があることも説明する。型定義の内容pin・実NodeのOS実装との一致は未確認で、APIは呼んでいない。

利用可能CPU数Nと、counterが返すCPU数Cを別fieldにする。`cpus().length`からworker数を決めず、busy比率をNで割って「アプリ利用可能CPUの使用率」へ変換しない。OS／container／affinity等で両者のscopeが異なり得るため、同一provider profile・同一観測scopeとして比較できるかを別確認する。

## 2 固定取得profile案

| 項目 | 将来の取得候補 | 検査・除外 |
|---|---|---|
| CPU counter | pin済みNodeの`os.cpus()`から、Cと各slotのtimes 5項目だけを内部projection | CPU model／speed文字列・識別情報は保存しない。C=0、C>256、項目欠落・不正数値を拒否 |
| 利用可能CPU数N | 同Nodeの`os.availableParallelism()` | 1〜256の整数候補。未提供・不正値はcpus長へfallbackしない |
| load | `os.loadavg()`の1／5／15分値 | 有限・非負、固定3値。未対応platformの代用0を正規の低負荷へ昇格しない |
| memory | `os.freemem()`／`os.totalmem()` | 非負の安全整数byte・free≤total。pressure／swap／OOM余裕の証拠としない |
| clock | 外側ownerの同一単調時計でcall前／後、相関用UTC | 逆行・非数値・例外は拒否。UTCでdeadlineを計算しない |

取得は試験外側の同TrialOwnerに結合した、固定のprivate providerから行う将来案。設定から任意command・URL・callback・resolverを登録できる形にしない。`top`／`ps`／shell loop／global process列挙や別agentへの問い合わせに切り替えず、実行方式の違いを一つのmetricへ混ぜない。

Windows等でloadの意味が成立しないprofileでは`unsupported`とし、現在の比較条件へ適合させない。対応platformの本当の0は有効値であり、値が0というだけで未対応とも判定しない。platform／source profileの明示が必要である。今回OS情報や実loadを採り直していない。

同一CPU集合・counter単位・累積epochが保たれることをproviderの前提とする。個々のslot番号やmodel名は永続CPU identityの証拠ではない。count変化、reset／wrap、再起動・scope変化を検知したら不足を残す。同数CPUの入替え・並べ替えを確実に検知できるかは未確認で、その安定性を確認できないprofileを完全な負荷適合の証拠にはしない。OS監視調査を本書で再開しない。

## 3 CPU busyの計算契約

### 3.1 入力と差分

予定sample S0〜S5について、同じscopeのCPU c、bucket bの累積値を`x[k,c,b]`とする。bucketはuser／nice／sys／idle／irqの固定5種。元値は非負の安全整数millisecondsのみ受け、fraction／NaN／Infinityを丸めて通さない。

隣接sampleごとに各CPU／各bucketで`d[k,c,b] = x[k,c,b] - x[k-1,c,b]`を求める。**各項目の非負を先に検査**し、別CPUの増加でresetを隠さない。C・観測scope・epochが違う点は差分に使わない。

各区間k=1〜5のbusyとtotalは次とする。

- `U_k = Σ_c(d_user + d_nice + d_sys + d_irq)`
- `T_k = U_k + Σ_c(d_idle)`
- `busy_k = 100 × U_k / T_k`（percent）、ただし`T_k > 0`かつ`0 ≤ U_k ≤ T_k`。

T=0は「0%」ではなくcounter区間無効。負の差分を0へclipせず、counter reset／wrap等としてその区間と5秒集計を無効にする。msとµsを混ぜない。nice／irqの実測0は正規値だが、欠落項目を0で補完しない。

### 3.2 nominal 5秒窓の集計

5区間が全て有効な場合だけ、`U_5s = Σ_k U_k`、`T_5s = Σ_k T_k`、`busy_5s = 100 × U_5s / T_5s`を作る。区間percentの単純平均ではなく、会計totalで重み付けした比率とする。間隔が揺れたときに単純平均へ切り替えない。

これは同じ予定5秒窓に対応する実counter差分であり、OSが各CPUを完全に同時刻に読んだ証拠ではない。call前／後の時刻、実観測span、予定時刻との差を残す。CPU counterを壁時計5,000msから補間・推計して作らない。1区間でも欠ければ残り4区間の平均を「5秒平均」として公開しない。

### 3.3 算術・表示・対照判定

安全整数の元値を検査後、内部では整数差分・加算をlosslessに扱う。候補C上限256×5bucketでは、各field≤2^53−1の集計がunsigned 64-bitに収まる範囲を使い、上界超過は拒否する。1区間では`U_k`／`T_k` ≤ 1,280×(2^53−1) < 2^64が成り立つ。5秒合計`U_5s`／`T_5s`は、区間ごとの上界を足すと6,400×(2^53−1)となり2^64を超えるので、その見積りに依拠しない。各CPU・各bucketで5区間の差分の和は`x[S5,c,b] − x[S0,c,b]`に等しく、累積値が2^53−1以下なら差もそれ以下になることを上界の根拠とし、`U_5s`／`T_5s` ≤ 1,280×(2^53−1) < 2^64とする。区間ごとに検査してから合計するなど、この等式を使えない実装では128-bitで集計する。比率はU／Tの整数pairで保持し、JSON化には最大20桁の10進文字列を使う案とする。

H0／H1のbusy差≤10 percentage pointsという親計画のdraft判定は、同じprofileで有効な両pairについて`10 × abs(U0×T1 − U1×T0) ≤ T0×T1`で比較できる。中間値は有限256-bit以内の整数計算候補とし、表示用percentの丸め値で合否を決めない。等号は親条件どおり適合側、上回れば負荷不適合である。

説明用の例として、2区間がU／T=50／100と0／900なら、単純平均25%ではなく全体50／1000=5%となる。これは算式の例であり、採取値・性能実証・試験結果ではない。

## 4 予定時刻・起動直前snapshot・jitter

本節は上記の7frame代替案であり、親§4.3の6点／S5・1,000ms未満という現行候補を満たす方式と称さない。7frame案を採る場合の親設計更新は、選択・レビュー後の別変更とする。

`t_arm`は親時間枠設計の起点のまま、S_kの予定を`t_arm + k×1,000ms`（k=0〜5）へ固定する。6点から5区間を作り、起動直前snapshot Lを別slotへ一度だけ採る。Lはload／N／memory／clockのlight snapshotで、5秒CPU平均の端点を差し替えず、新しいCPU平均も計算しない。

候補の採取品質条件は、各S_kの開始が予定以降100ms未満、call前後spanが50ms以下であること。遅いcallbackが複数slotをまとめて埋めるcatch-up採取はしない。非atomicなOS取得・tick精度・実spanは不足として併記し、「厳密に同時・5,000msちょうど」と主張しない。このjitter値も未承認・未実証である。

Lの採取終了から実際の`t_spawn`まで100ms以下を候補の鮮度条件とし、同時に親条件の`t_arm+5,000ms ≤ t_spawn < t_arm+6,000ms`を満たす必要がある。起動呼出し直前に鮮度・停止・pinを再確認する。Lが古いから再取得する、t_armを更新して待つ、採取用に1秒を追加する方式は使わない。

LはCPU counterを再読しないため、S5以降のC／epoch継続を新しく測定したとはしない。安定性を供給profileで確認できなければUnknownのままで、追加getterやCPU集合の推定で埋めない。

S0〜S5・Lのいずれかの必須値や時刻が無効／欠落なら、当該trialの起動は0回のまま不適合を残す。N・scopeの変化も隠さない。Lが有効でも5秒CPU集計の欠落を代用できず、逆も同じである。終了後loadを開始値へコピーしない。

## 5 件数・容量・取得回数の候補上限

全て実装前の有限受理profile案で、物理allocation／work費の実証ではない。実OS getterが返す一時objectの生成まで事前にこの値で抑制できるとはしない。

| 対象 | 上限候補 | 費目所有・超過時 |
|---|---|---|
| CPU slot | 1sampleで最大256、times固定5項目 | SamplerOwnerのscratch。上限CPU数を超えたら容量不適合で、worker数を256へ変更しない |
| 生counter scratch | 前／現在の2面、各256×5×8byte＝計20,480byteのlogical payload | per-CPU検査後は集計だけを固定frameへ保持。JS object・native配列・GCの実memory上界はUnknown |
| sample frame | S0〜S5の6件＋Lの1件＝7件 | sampleごとにgetter各1回。retry／catch-up／ring上書きなし |
| 差分区間 | 5件 | 有効／欠測を同じ予定indexへ保持。bridge差分で欠測を跨がない |
| その他の固定slot | header・summary・terminal各1件 | 計15record。診断で可変長event列を追加しない |
| logical取得 | Sは5 OS getter＋前後mono＋UTC＝8回、Lは4 OS getter＋前後mono＋UTC＝7回、最大55回 | OS getterは計34回。provider内部のnative操作数・所要時間までは証明しない |
| encoded frame | header≤1,024byte、各sample≤2,048byte、各区間≤1,024byte、summary≤4,096byte、terminal≤2,048byte | UTF-8 byteで事前上界を検査し、超過で固定診断。文字数・圧縮後sizeを使わない |
| 共有encoded予約 | 最大32,768byte／trial | 上記26,624byte＋framing512byte＝27,136byteの配賦候補。余りは再試行・別trialへ流用しない |

固定IDは最大64 ASCII文字等の有限schemaとし、counterの10進文字列・時刻・理由の長さも制限する。無制限path・CPU model・stack・環境全量・source・認証値をrecordへ載せない。providerが巨大値を返した場合も、全文serializeしてからsizeを測る方法は採らない。

P9の固定4trialはこのsampler payloadで最大128KiB、P8も行う場合は別4trialで追加128KiBを予約する候補。これはrunnerのstdout／stderr、依存pin、in-run sampling、上位custody全体の上界ではない。各別費目を本予約へ押し込めて充足済みにしない。

受理・projection・差分・encodingのworkと、native getter・clockの費用は実装前の別検証が必要。採取の自己負荷はhost会計にも入り得るため、勝手に引き算しない。同じprofile／scheduleで両HEADへ適用しても非影響の証明にはならず、OS設定・warmupで条件を整えない。

## 6 欠落・未対応・不正の表現

metric／frameは、`ok`と`missing`／`unsupported`／`invalid`／`late`／`cancelled`／`not_started`を区別する案とする。非ok variantに正規valueを置かず、0／空配列／NaN／前回値で穴を埋めない。raw例外ではなく固定理由と予定indexを保持する。

| 固定理由の例 | 意味・保持 |
|---|---|
| provider_unavailable／unsupported_platform | 未提供と未対応を明示。Windowsの代用load 0等を観測成功にしない |
| provider_throw／clock_invalid | 取得失敗と時刻保証の不足。最初の理由を保持、raw例外は非出力 |
| counter_invalid／counter_reset／zero_total | 欠落・不正数値・逆行・区間total 0を分ける。busy=0へ変換しない |
| scope_changed／topology_unconfirmed | N／C／counter集合・epoch等が比較前提を満たさない |
| sample_missing／sample_late／snapshot_stale | 未実行・予定外・起動時鮮度不足。予定slotは欠測のまま |
| capacity／encoding_limit | 計数・schema・保持上限を満たさない。部分prefixと不足を保持 |
| receipt_unconfirmed／owner_lost | 正常値が採れても、同trialへの保持・移譲が確認できない |

元の観測値の妥当性、timing品質、scope妥当性、保存／受領状態は別fieldである。数値が有効な場合でも遅延したframeを起動前適合へ昇格しない。metricを取得できなかった場合はそのvariantを残し、「低負荷だった」「環境原因だった」と推定しない。

## 7 停止・取消・上位への保持

先行slot／容量予約→固定S0〜S5→差分・5秒集計→L→一度限りの上位受理／保持→spawn直前guard→既存起動chainへの試行、という案とする。受理待ちでLが古くなればguardで拒否し、受理済みだから起動可能としない。最終guard後には別の待ち・受理通知・観測処理を挟まない設計とし、実際の同期停止／起動境界への接続は未実証のまま残す。停止や必須値の不足が先に確定したら、新しいgetter・追加sample・runner起動をしない。以後の予定slotはnot_started／missingを理由付きで残し、集計を作り直さない。

既に開始した同期getterを即時中断できるとはしない。停止後に返った値はlateとして保持し、gateに採用しない。clock異常でjitterや鮮度を評価できなければ、時間保証をUnknownとして終了ownerへ渡す。親のcleanup予約をsample再開に使わない。

正常採取でも元sampler slotを解放するのは、同trial／pin／profileへの上位受理が確認できてからとする。送信だけ・同値copy・別trialのreceiptは受理証拠ではない。通知throw・ack欠落・部分生成では、最初の理由、保持済みframe、欠測、未解放責務を同slotへ残す。上位owner／保管の実装・耐障害性は未確認で、本書では接続しない。

このsamplerは起動前専用で、L／受理後に周期採取を続けない。起動後のrunner／worker CPU・RSSや終了直前の別snapshotは、親計画で要求される**別の未設計・未接続費目**である。開始前7frameで実行中／終端の証拠も揃ったことにはしない。製品telemetry・VM／監視調査は保留のまま維持する。

## 8 負荷適合への供給・判断

親計画のload1／N差≤0.10、load5／N差≤0.15、busy差≤10 percentage pointsというdraft条件を変更しない。Lのload／Nと、S0〜S5からのbusy_5sを同trialへ結合する。比較はH0／H1の同じP9同士、または同じP8同士に限る。

両trialのsource profile・scope・N／C・有効な5区間・起動直前鮮度・実効worker数等の親gateが必要。欠ければ比較不適合／Unknownであり、残る数値だけで適合にしない。free memoryは開始状況の記録であってpressureの同一性証明ではなく、欠測を実測0として扱わない。

負荷不適合はtestの失敗ではない。高負荷値を見てquietになるまで再採取する、外部アプリを止める、優先度／電源設定を変える、worker数を揃える、成功trialだけを選ぶことはしない。元の固定4trialの記録に不適合／未開始も残し、追加runは別判断とする。

## 9 後続の純粋fake受入案（全て未実施）

| ID | 対照 | 必須条件 |
|---|---|---|
| LC01 | 6点＋L、CPU 1／複数、固定bucket | 7frame・5区間・同trialの比率が手書きoracleと一致 |
| LC02 | 区間totalの偏り | 単純percent平均を拒否し、50／100と0／900から5% |
| LC03 | 実測0／欠落／T=0 | 有効idle-only 0%と非okを区別、T=0を0%にしない |
| LC04 | 一CPUのcounter逆行・reset／wrap | 他CPUの増加で隠れず、5秒summaryを無効化 |
| LC05 | C=0／256／257、N不正・scope変化 | 上限境界・未対応・topology不足を固定拒否し、並列度を変えない |
| LC06 | 安全整数上限・合算／比率の中間値 | losslessに比較、overflow／fraction／NaN等を拒否 |
| LC07 | sample欠測・late・jitter境界 | 補間・catch-up・再起点なし、spawn 0 |
| LC08 | Lの鮮度・handoffの直前／一致／直後 | CPU窓の差替えや再Lなし。親の絶対枠を維持 |
| LC09 | 同じ0でもplatformが異なるload | 実測0とunsupportedを取り違えない |
| LC10 | encoded上限・CPU scratch・record件数 | UTF-8 byteで上限保持、ring上書き・全文serialize前の無制限保持なし |
| LC11 | provider／clock例外・取消・同期getterの遅い復帰 | 最初の理由・late値・未確認責務を保持し、成功へ戻さない |
| LC12 | 別profile／trialのframe・receipt copy・通知失敗 | 混入拒否・元slot保持。上位受領を推測しない |
| LC13 | 10 points差の直前／一致／直後、表示丸め | exactな整数pairで判定し、表示値をoracleに使わない |
| LC14 | 起動後の追加採取・低負荷になるまでretry | 起動前契約の閉鎖を維持し、別費目へ無断移行しない |

oracleは計算器／providerの判定表から期待値を作らず、固定counter・時刻・欠測列から独立に定義する。busy差、bucket減算、欠測補完、byte上限、deadline更新等の誤実装を個別に検出する将来案である。現在はfixture・計算器・実provider・試験を追加していない。

## 10 未確認・実施前gate・今回の範囲

provider／Nodeの実内容pin・OS counter集合の安定性・非atomic読取の影響、50／100ms等の候補値、256CPU・容量profileの採用、native getter／encodingの費用上界、起動直前guard・終了owner・上位custody・保管先／保持期間は未確認・未承認部分を含む。実行中／終端負荷の取得境界も別途必要。これらを設計だけで充足済みにしない。

親の6点案と本書の7frame案の選択・統一も未完了であり、現在の状態は実装開始gateを満たさない。6点案を採る場合は本書のL・取得回数・容量等も再計算する必要があり、55回／15recordをそのまま流用しない。

今回の変更は本MDと親2文書の参照だけ。実装・OS getter実行・CPU／memory／load採取・設定評価・copy作成・build・試験再実行・実process対照・実接続・実通信・設定変更・Pushは行わない。元の5秒期限・既定並列度と各閉鎖条件・Unknown・調査保留を維持する。

文書整合では3文書のローカルリンク14件・表19個の列数、LC01〜14の計画ID連番、15record・getter55回・encoded配賦27,136byte≤32KiB等の算式、末尾改行・差分空白と変更対象MD3件を確認した。算式の検算は実測・合成試験・profile承認ではない。作成時点でコミット・Pushは未実施。

## 11 6点案・7frame案の比較と選択条件（2026-11-14）

[6点案・7frame案の比較と選択条件draft-0.1](BEST_PRACTICE_WFB_SGA_LOAD_PROFILE_COMPARISON.md)に、共通のCPU窓、light値の返却後ageとデータage、追加費・保持の再計算を整理した。LOAD6／LOAD7は未選択のままで、7frameのLがCPU busyを更新するとはしない。L spanや6点案のschema等も未確定であり、本書の代替案・元の5秒／既定並列度・各閉鎖条件を変更せず、実装・採取・再実行は行わない。

## 12 後続の鮮度・時間配賦の詳細設計（2026-11-14）

[鮮度要求・L取得所要時間・起動までの時間配賦draft-0.1](BEST_PRACTICE_WFB_SGA_FRESHNESS_HANDOFF_BUDGET_DESIGN.md)で、Lの取得区間と返却後費用・データageの関係、Q／R／Tの分離と未確認費、call前拒否とcall済み時刻違反を整理した。55回はframe取得数であり、境界観測等を含む全操作数へ昇格させない。既存profile・L span・容量の採用や変更はせず、選択未承認・各閉鎖条件・Unknown・調査保留と、実装・採取・再実行未実施を維持する。
