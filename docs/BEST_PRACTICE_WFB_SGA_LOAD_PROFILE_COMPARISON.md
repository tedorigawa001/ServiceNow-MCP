# WF-B SG-A後：6点案・7frame案の比較と選択条件

Version: draft-0.1 / Date: 2026-11-14 / 読取り基準HEAD: `4c0e0f1`。

Status: **比較設計のみ。両案とも選択・承認は未完了。** 元のtest 5,000ms・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・Pushは行わない。

比較対象は[終了確認・時間枠設計§4.3](BEST_PRACTICE_WFB_SGA_TERMINATION_OUTER_BUDGET_DESIGN.md)の6点候補と、[開始時負荷採取設計§4〜5](BEST_PRACTICE_WFB_SGA_START_LOAD_CAPTURE_DESIGN.md)の7frame代替候補。親の[通常並列対照計画](BEST_PRACTICE_WFB_SGA_PARALLEL_TIMEOUT_CONTROL_PLAN.md)のP9／P8はworkload集合の名前であり、以下の採取profile名とは別である。

## 1 比較用の識別・共通前提

| 仮称 | 現行文書上の位置 | 比較対象 |
|---|---|---|
| LOAD6 | 親時間枠設計の現行候補。承認済み既定値ではない | S0〜S5の6点。S5を起動直前snapshotとし、spawnまで1,000ms未満 |
| LOAD7 | 開始時負荷採取設計の未承認代替候補 | 同じS0〜S5にlight snapshot Lを1件追加。L返却後からspawnまで100ms以下の候補 |

S_kの予定時刻は`t_arm + k×1,000ms`（k=0〜5）。親の起動候補条件は両案とも`t_arm + 5,000ms ≤ t_spawn < t_arm + 6,000ms`のままとする。ここでの5秒採取窓はtest一件の5秒期限とは別であり、採取を理由にtest期限・並列度・時間枠の起点を変えない。

CPU provider・Node／依存pin、scope・counter epoch、C上限256、元値の単位・妥当性、欠測時停止、owner／receipt、同trialへの結合は共通である。実getter費・OS allocation・非atomicな取得・topology安定性・受理通知費は未確認で、どちらも実施前gateを満たしていない。

## 2 比較表

| 項目 | LOAD6 | LOAD7 | 判断上の注意 |
|---|---|---|---|
| CPU counterの点数 | S0〜S5の6点 | 同じ6点。Lではcounterを読まない | CPU busyの根拠点数は同じ |
| CPU busyの窓 | nominal `[t_arm, t_arm+5秒]`の5区間 | 同じ5区間 | `[t_spawn−5秒, t_spawn]`のrolling窓ではない |
| CPU busyの起動時鮮度 | S5以降の新counterなし | 同じ。Lがあってもbusyは更新しない | **7frameでもCPU busyが起動直前100msまで更新されるわけではない** |
| load／N／memoryの供給点 | S5 | L | 7frameはlight値だけを後で取り直す |
| 鮮度の現行記述 | S5 sampleからspawnまで1,000ms未満 | L取得終了からspawnまで100ms以下 | 時刻fieldとcall spanを揃えないと同じ鮮度指標として比較できない |
| 追加getter | なし | load／N／free／totalの4 OS getter、前後mono＋UTC | os.cpusの回数はどちらも6。getter数差を実時間差へ直結しない |
| critical path | S5受理→集計・保持／上位受理→最終guard→spawn | S5後の集計→L→保持／上位受理→最終guard→spawn | L後の受理待ちも鮮度を消費。どちらも再取得・起点延長なし |
| 欠測・追加失敗点 | S5までと受理／guard | 同じ境界＋Lの取得・保持・鮮度 | 追加の観測機会と追加の拒否点があるが、失敗率は未計測 |
| 生CPU scratch | 同じ2面 | 同じ2面 | Lはraw counter保持を増やさない |
| 保持／encoding | 下記の共通schema仮定で14record | 現行代替案で15record | 6点案の再計算値も未承認候補 |
| 共有encoded予約 | 比較用には32KiBを同じく仮定 | 32KiB候補 | 予約capを同じにした比較では、6点案を2KiBの実allocation削減とは言えない |

## 3 CPU busyの5秒窓を選択で変えない

両案とも各CPU・各bucketで隣接差分を検査し、有効な5区間についてのみ`busy_5s = 100×ΣU_k/ΣT_k`を作る。区間percentの単純平均、欠測を跨ぐ差分、負値のclip、最後に採れた点だけへの置換はしない。LへS5のbusy値をコピーしても、それは新しいcounter観測ではない。

actualなcall前／後の時刻・jitter・実spanは別記録する。S0〜S5は完全に同時取得されたCPU値でも、壁時計5,000msちょうどの測定でもない。spawnがS5より後になる分のCPU時間は両案とも未観測であり、窓のlagを示す。起動前5秒を厳密にspawnへ揃える要求が別に必要なら、両案ともその要求を満たすとせず、別設計・別承認へ戻す。本比較で第3の採取方式を採用しない。

整数上界は[開始時負荷採取設計§3.3](BEST_PRACTICE_WFB_SGA_START_LOAD_CAPTURE_DESIGN.md)に従う。64-bit候補の根拠は、同じCPU・bucket・epochの累積差分がS5−S0へtelescopingすることを確認できる場合に限る。5個の独立した区間上界を足して64-bit以内とする説明は使わない。必要な前提・演算幅・符号化前範囲が確認できなければUnknownであり、profile選択で解消したとはしない。

## 4 snapshot鮮度：返却後ageとデータageを分離

各frameについて`scheduled_at`、getter群の`read_begin`／`read_end`、`t_spawn`を同clock domainで保持する。`return_age = t_spawn − read_end`と、保守的な`data_age_upper = t_spawn − read_begin`を分ける。getter群は非atomicなので、read_endを全fieldの取得時点と見なさない。

LOAD6の親記述は予定S5を基準に1,000ms未満を要求する。実装前には予定時刻と実read時刻を混同しない検査を確定する必要がある。S5が予定以降に開始し、返却もspawnより前なら、`data_age_upper < 1,000ms`を確認できる候補になる。予定外に早く採ったsampleで帳尻を合わせない。

LOAD7の既存候補は`return_age(L) ≤ 100ms`で、Lのgetter群の全span上限はまだ明確に固定されていない。したがって**返却後100msを、全fieldが100ms以内に読まれた保証とはしない**。仮にLにもspan≤50msという補完候補を承認するなら、`data_age_upper ≤ 150ms`という計算になる。これは補完案であり、今回Lのspan上限を承認・設定したものではない。

LOAD7で必要なのがデータageそのものの100ms上限なら、read_begin基準へ条件を変更するか、spanとreturn_ageの別配賦を明示する必要がある。どちらも現在の返却後100ms候補とは同じ契約ではなく、選択時レビュー事項とする。平均値・推定値で不明なcall内時刻を埋めない。

両案とも上位受理の完了後、実spawn呼出し直前に停止・pin・鮮度・親の6秒未満条件を確認する。受理待ちで古くなればspawn 0、再sample／再L／handoff延長なし。最終guard後に別の待ち・通知・観測を挟まない同期境界の実装保証は未確認のまま残す。

## 5 取得費・保持上限の同条件再計算

LOAD6の費用を具体化するため、比較に限りLOAD7の固定field／record上限をS0〜S5へ共通に適用する仮定を置く。これは親の6点案へschemaや数値を採用したことではない。6点案に別のfield・providerを使う場合は再計算が必要である。

| 候補上限・計数 | LOAD6 | LOAD7 | 差／限界 |
|---|---|---|---|
| OS getter | 6×5＝30回 | 30＋4＝34回 | ＋4、CPU counter getterは両方6回 |
| mono／UTC | 6×3＝18回 | 18＋3＝21回 | ＋3 |
| logical取得合計 | 48回 | 55回 | ＋7。native操作数・wall time・CPU費の増率ではない |
| 生CPU payload | 2×256×5×8＝20,480byte | 同じ20,480byte | native配列／JS object／GC上界はUnknown |
| sample／区間／その他 | 6／5／3 | 7／5／3 | 14record／15record |
| encoded record配賦 | 1,024＋6×2,048＋5×1,024＋4,096＋2,048＝24,576byte | 26,624byte | ＋2,048byteはLのrecord上限 |
| framing込み | 24,576＋512＝25,088byte | 26,624＋512＝27,136byte | 共通32,768byte候補内。実sizeは未測定 |
| 共有予約の余り | 7,680byte | 5,632byte | 余りを追加sampleやretryへ使わない |
| 固定4trialの予約 | 128KiB | 128KiB | 共通32KiB仮定なら同じ。P8追加は別予約 |

取得費は、counter読取り・残りのgetter・projection／検査・整数集計・encoding・保持／receipt・最終guardを分けて見積もる。LOAD7の追加Lが100ms鮮度とhandoffに収まるか、LOAD6の全field取得が1秒条件内かは、呼出し数の比較だけでは分からない。native getterや受理通知の上界は未導出である。

保持の実allocationを小さくしたい要求があるなら、別の予約profile・構造上界の設計と承認が必要であり、本表の2KiB差だけで「省memoryを実証」としない。自己負荷はどちらにも入り得るため、CPU busyから勝手に減算せず、両案の実負荷を今回は測らない。

## 6 選択を検討できる条件

| 要求／証拠 | LOAD6を検討できる場合 | LOAD7を検討できる場合 |
|---|---|---|
| CPU busy | nominal 5秒窓とS5後のlagを受け入れる | 同じ条件が必要。Lによるbusy更新は要求しない |
| light値の鮮度 | S5から最大1秒未満という候補の意味・限界を受け入れる | 起動直前の再読が必要で、return_ageとdata_ageの要求を明示できる |
| 費用 | 追加Lを置かず、S5後の集計・受理・guardが親枠に収まる根拠がある | 追加7logical取得・encoding・受理の費用とLのspanが候補枠内と確認できる |
| 保持 | 14recordのschema／上限を確定できる | 15recordのschema／上限を確定できる |
| 前提・失敗時停止 | scope／counter・clock・欠測・receiptの共通gateが満たせる | 同じgateに加えてL失敗・鮮度不足を保持し、追加取得を再試行しない |

追加取得費を避けたいという理由だけで1秒の鮮度を自動承認しない。より新しいlight値が欲しいという理由だけでLOAD7を推奨済みとせず、Lのspan・追加費・受理費がUnknownなら選択根拠は不足する。

要求が「起動直前100msまで更新したCPU busy」である場合、両案とも選択条件を満たさない。共通gateや既定並列度・元5秒を保てない場合も、どちらかを強制選択しない。実装しやすさ、過去のtest成功、候補数値の小ささを、証拠の代わりにしない。

## 7 選択の固定・未承認チェックリスト

以下は全て未記入／未承認。比較表を書いたことを選択receiptにしない。

- [ ] 選択profile：LOAD6／LOAD7のいずれか（未選択）。
- [ ] CPU busy窓の位置・実span・S5後のlagを受け入れる要件。
- [ ] light snapshotの鮮度の基準時刻、許容age、call span、jitterの明示。
- [ ] provider／Node／依存pin・scope／epochの確認方法。
- [ ] getter・encoding・上位受理・最終guardの費用と容量予約。
- [ ] 欠測・停止・late値・未受理／未解放責務を保持する条件。
- [ ] 親子文書を同じprofileへ統一する変更対象・review責務。
- [ ] 実装・fake検証・実採取／再実行等の個別承認区分。

profileは結果を見る前に比較計画の版へ固定し、H0／H1の同じP9またはP8の全4trialで同じものを使う。取得値・負荷適合結果・通知遅延を見てLOAD7からLOAD6へfallbackする、trial途中で切り替える、両案の有利なfieldだけを混ぜることはしない。profileが異なるtrialの適合比較も成立としない。

選択条件を満たせなければ未選択のままgateを閉じる。選択自体を実装承認・起動承認・profile数値の実証・正式な証拠発行へ昇格させない。現在はその選択も行っていない。

## 8 将来選択した場合の文書統一範囲

| 文書／境界 | LOAD6選択時に必要な更新 | LOAD7選択時に必要な更新 |
|---|---|---|
| 対照計画§5 | S5 source・鮮度とCPU窓の意味を確定 | S5／Lのfield供給を分け、追加frameを明示 |
| 時間枠設計§4.3 | sampleの予定／実read時刻と最終guardを統一 | 「追加sampleなし」の候補を明示的に変更し、L span・鮮度を統一 |
| 開始時負荷採取設計§4〜8 | Lを除いた件数・費目・schema・保持・受理順へ改定 | Lのcall spanとage意味を確定。S5のCPU窓は置換しない |
| 受入案・record | LOAD6の境界・欠測・14record等を独立oracleへ結合 | L失敗・55取得・15record等を独立oracleへ結合 |

元の5秒test期限・既定並列度、H0／H1とP9／P8のworkload差、調査保留・各閉鎖条件は両案共通で変更しない。外側120秒・cleanup30秒等も選択で自動承認せず、候補と未確認事項を保つ。

今回この統一変更は実施しない。既存文書の6点候補と7frame代替候補を残し、本書への参照だけを追加する。選択後に無言で片方を既定値へするのではなく、将来の明示的なreview対象とする。

## 9 後続の比較検証案（全て未実施）

| ID | 確認する関係 | 必須条件 |
|---|---|---|
| PC01 | 同じS0〜S5にLだけ追加 | busy pairが不変。LをCPU endpointにしない |
| PC02 | interval総量が異なる場合 | 両案とも同じ重み付き比率。単純平均なし |
| PC03 | S5からspawnのlag | nominal窓とspawn基準窓を取り違えない |
| PC04 | LOAD6の1,000ms直前／一致／直後 | 等号以上を受理しない。missingと実測0を分ける |
| PC05 | LOAD7のreturn_ageとread span | 返却後100msをdata_age100msと誤認せず、span未確定は不足として保持 |
| PC06 | Lの取得／上位受理が遅れる | frame追加・再起点・親時間枠延長なし。spawn 0 |
| PC07 | 件数・byte上限・共通32KiB | LOAD6の再計算とLOAD7との差が一致。余りを追加取得へ流用しない |
| PC08 | 別profile／trialのfield混入・fallback | profile不一致を拒否し、選択receiptを推測しない |
| PC09 | scope／epoch／counter欠落 | 追加LでCPU窓の不足を埋めずUnknown・停止を保持 |
| PC10 | 表示丸め・整数幅・telescoping前提 | exactなpairと必要な演算幅を保持し、profile選択で上界不足を隠さない |

これは将来の純粋fake／独立oracleの計画であり、実装や合成試験を追加したものではない。実費・timer精度・OS差を測る採取、SG-Bや実process対照も別の承認が必要なまま残す。

## 10 今回の範囲・Unknown

本書と親2文書の参照だけを更新する。profile選択、鮮度の実証、provider費・allocation上界、scope安定性、上位受理費、実行中／終端負荷の採取、終了owner・保管条件は未確認／未承認。実装・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・Pushは行わない。

元の5秒期限・既定並列度と、通常経路未切替・正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。作成時点でコミット・Pushは未実施。

文書整合として3文書のローカルリンク13件・表17個の列数、PC01〜10の計画ID、未承認チェック8項目、取得回数・encoded配賦・整数上界の算式、末尾改行・差分空白を確認した。これは文書と定数の静的検算であり、負荷採取・合成試験・試験再実行・実費の実証ではない。
