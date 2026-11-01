# EF-03B：旧case単位の対応表（B-02-03後）

Version: br006-case-crosswalk-draft-0.1 / Date: 2026-11-01。
Status: **文書による静的照合案。旧試験330件をすべて維持。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実装・試験変更・friend撤去・実接続・実通信・実機操作・設定変更・Pushは行わない。**

## 1 基準と読み方

基準HEADは`7b29542`、実装基準は`f183a08`。両者の`src/`・`tests/`差分は空である。[親移行計画](BEST_PRACTICE_ABORT_SCOPE_DEVELOPMENT_ROOT_EF03B_DESIGN.md)§3の12旧ファイルを対象に、B-02-03コミット前の既存JSON `/tmp/servicenow-b0203-commit-test-20261101.json`から展開済みfullNameを読み、現行case本文・実装と照合した。JSON SHA-256：`ff6289cf6ebaf9cfc7d51b80eb5d6ba8f5d6b82f49de867c5324239c14e6bc98`。JSON自体は一時領域の既存証拠であり、本書へ試験本文・資格情報・全レポートは複製しない。

旧330件／参照用の新139件はすべて同JSONでpassedだったが、これは過去の実行結果であり、本作業で再実行した結果ではない。対応判定はAIによるcase本文の静的照合案であり、新たな性能評価・人の承認・移行完了の証拠ではない。

- **維持**：旧位置のcaseをそのまま継続し、別assemblyへの置換を対応付けない。B-KEEP、共通kernel／実factory（B-EF）、friend非依存の純粋source model（B-UNITの一部）が該当する。新版対応済み件数には数えない。
- **部分対応**：新caseに一部の同目的assertionがある。ただし入力、故障点、返却形状、診断層、brand、実class結合の少なくとも一つは未代替。「共有コードがある」ことも全assertionの同等性を意味しない。
- **未対応**：同条件の新caseがない、または関連caseは差分比較だけで旧assertionの証拠にならない。**機能が必ず未実装という意味ではなく、case単位の対応証拠がない**という保守的な分類。

すべての分類で旧試験は維持する。「維持」148／「部分対応」109／「未対応」73はレビュー上の整理数であり、coverage率・品質ゲート・削除可能件数として使わない。B-02／B-03完了や旧試験削除を承認していない。

### case識別

行IDはこの版の参照用で、caseの同一性キーは**source revision＋ファイル＋fullName＋入力条件**。同じfullNameになるit.eachは入力条件で分ける。番号だけを永続キーにしない。fullNameはJSONの文字列をHTML codeとしてescapeして記載し、名前を書き換えていない。新IDは付録のファイル・fullNameへ結ぶ。「—」は対応先なし、「差分参照」は同等性を主張しない。

JSONには各it.eachの元入力そのものが保存されていないため、同名行の条件は基準sourceの列挙順と本文から補完した。将来の入力追加・順序変更では本表を再照合し、同じ番号だから同じcaseとみなさない。入力条件欄は識別用の説明であり、試験本文の複製ではない。

### 共有部分の凡例

| 記号 | 実際の共有・限界 |
|---|---|
| KC | [construction-state](../src/servicenow/review-kernel/construction-state.ts)。固定状態／理由／copy。実参照bindingは各rootに残る。 |
| KB | [canonical budget](../src/servicenow/review-canonical-budget.ts)。新規coreごとの会計／lease。実sessionと開発coreのidentityは別。 |
| KV-P | [source-values](../src/servicenow/review-kernel/source-values.ts)の親5列／target検査。UTF-8・JSON decode、pin、consumerは各経路。 |
| KV-R | 同moduleのbuild_name projection。family判定／C方式／permitを含まない。 |
| KN | **仕様上の類似だけで旧ND cleanup実装とのコード共有ではない。** 新EF-03は[ST cleanup部品](../src/review/abort-scope-evidence-status-cleanup.ts)の別realmを利用するが、旧[ND module](../src/review/abort-scope-evidence-native-diagnostic.ts)には別の実装・上位owner・import時friend取得がある。 |
| — | 本行で新旧共通コードを根拠に対応付けない。型・API名・同じ固定理由だけでは共有証拠にしない。 |

共有欄は対応付ける機構を示すもので、拒否が早期に起きる各caseで全共有関数を通るという主張ではない。

### 未代替保証の凡例

PC-01は実session／登録owner／実sourceの同private継続、PC-02は実認証snapshot／登録ready世代／同canonical lease、PC-03は実sourceのrelease判断・private ack／ReleasePermit、PC-04は実session停止→native／外側closeの診断保持。これらは別assemblyの成功で代替しない。PC-05（選択window／payload receipt／worker job）は今回の330件によっても新たに完了しない。実classを使う旧試験自体もfake I/Oであり、実通信の保証ではない。

## 2 旧case単位の対応

### SA — B-SA：実source／session接続

旧file：[source-status-binding.test.ts](../tests/review/source-status-binding.test.ts)、26件。別assemblyへの対応候補をcase単位に評価する群。旧caseは全件維持する。

| 行ID | 旧fullName | 入力条件（同名の識別） | 新case | 共有部分 | 分類 | 未代替の保証・残差 |
|---|---|---|---|---|---|---|
| <a id="o-sa-01"></a>SA-01 | <code>binds the real source and session continuation before close, without a permit or fallback</code> | fullNameで区別 | [DN-01](#n-dn-01)、[DS-32](#n-ds-32) | KV-P / KB / KC | 部分対応 | 実classの継続・同一性はPC-01/02/04。新版は独立source。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-02"></a>SA-02 | <code>accepts 403/no_body as a closed-gate source fact, never EOF or release evidence</code> | fullNameで区別 | [DN-02](#n-dn-02) | KV-P / KB / KC | 部分対応 | 403/no_body相当。実source draftの型・受理履歴は旧caseのみ。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-03"></a>SA-03 | <code>accepts 404/no_body as a closed-gate source fact, never EOF or release evidence</code> | fullNameで区別 | [DN-03](#n-dn-03) | KV-P / KB / KC | 部分対応 | 404/no_body相当。実source draftの型・受理履歴は旧caseのみ。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-04"></a>SA-04 | <code>does not reenter legacy GET, public source reads or the release/permit decision</code> | fullNameで区別 | [DB-17](#n-db-17)、[DN-21](#n-dn-21) | KB / KC | 部分対応 | 新版はnetwork非使用／非干渉まで。旧公開read／release method全spyは未移行。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-05"></a>SA-05 | <code>refuses unconfirmed cleanup and closes without calling fallback</code> | fullNameで区別 | [DN-07](#n-dn-07) | KB / KC | 部分対応 | native cancel拒否で未確認を作る別条件。旧fake cleanup申告の拒否は旧caseのみ。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-06"></a>SA-06 | <code>rejects malformed/foreign parent data before status acceptance</code> | 不正UTF-8: ff | [DB-29](#n-db-29) | KB / KC（UTF-8解析は別実装） | 部分対応 | parent拒否の共通値境界。新native経路で同じ各入力を網羅したcaseではない。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-07"></a>SA-07 | <code>rejects malformed/foreign parent data before status acceptance</code> | 異なるsys_id | [DB-30](#n-db-30) | KV-P / KB / KC | 部分対応 | parent拒否の共通値境界。新native経路で同じ各入力を網羅したcaseではない。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-08"></a>SA-08 | <code>rejects malformed/foreign parent data before status acceptance</code> | 親の余剰script列 | [DB-31](#n-db-31) | KV-P / KB / KC | 部分対応 | parent拒否の共通値境界。新native経路で同じ各入力を網羅したcaseではない。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-09"></a>SA-09 | <code>rejects non-profile input before creating authority</code> | release_status=200 | [DN-05](#n-dn-05) | —（同一コードの共有なし） | 未対応 | 差分参照のみ：旧profileはinvalid_input、新native HTTPは別分類。期待を同一視しない。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-10"></a>SA-10 | <code>rejects non-profile input before creating authority</code> | release_status=401 | [DN-04](#n-dn-04) | —（同一コードの共有なし） | 未対応 | 差分参照のみ：旧profileはinvalid_input、新native HTTPは別分類。期待を同一視しない。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-11"></a>SA-11 | <code>rejects non-profile input before creating authority</code> | cleanup=object | [DN-14](#n-dn-14) | —（同一コードの共有なし） | 部分対応 | 外部cleanup objectをprofileとして拒否する相当境界。旧observe結果schemaとは異なる。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-12"></a>SA-12 | <code>rejects non-profile input before creating authority</code> | session=object | [DS-25](#n-ds-25)、[DR-20](#n-dr-20) | —（同一コードの共有なし） | 部分対応 | live／余剰field拒否の関連caseのみ。旧session fieldの同一入力・入口は未移行。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-13"></a>SA-13 | <code>rejects non-profile input before creating authority</code> | fetch=function | — | —（同一コードの共有なし） | 未対応 | fetch注入を旧profileで拒否する独立caseなし。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-14"></a>SA-14 | <code>rejects non-profile input before creating authority</code> | delay_ms=10001 | — | —（同一コードの共有なし） | 未対応 | delay_ms=10001のstatus観測profile拒否caseなし。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-15"></a>SA-15 | <code>does not relax the existing fixed-200 fake transcript guard</code> | fullNameで区別 | [DB-06](#n-db-06) | —（同一コードの共有なし） | 部分対応 | 固定200 transcriptにstatusを指定すると拒否。旧実class guard自体の保証は残す。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-16"></a>SA-16 | <code>copies parent bytes before awaiting and never trusts caller mutation</code> | fullNameで区別 | [DB-35](#n-db-35) | KB / KC | 部分対応 | 同じ目的のcopy試験。ただし新版は別pin実装、native parent-copy専用assertは未移行。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-17"></a>SA-17 | <code>stops cancellation during delayed fake observation and frees timers/admission</code> | fullNameで区別 | [DB-37](#n-db-37)、[DN-09](#n-dn-09) | KB / KC | 部分対応 | 合成delay取消／native cleanup join。旧status観測delayそのものではない。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-18"></a>SA-18 | <code>refuses an already cancelled run before readiness or acceptance</code> | fullNameで区別 | [DN-12](#n-dn-12)、[DR-17](#n-dr-17) | KB / KC | 部分対応 | 事前取消・C=0相当。実factory互換性は旧caseのみ。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-19"></a>SA-19 | <code>keeps the lowered responseBytes ceiling</code> | fullNameで区別 | [DB-27](#n-db-27) | KB / KC | 部分対応 | response capはtranscriptで検証。新native profileには低減limits入口／同caseがない。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-20"></a>SA-20 | <code>keeps the lowered totalBytes ceiling</code> | fullNameで区別 | [DB-26](#n-db-26) | KB / KC | 部分対応 | total capはtranscriptで検証。新native profileの同caseは未対応。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-21"></a>SA-21 | <code>retains final-four reservation at request cap 4</code> | fullNameで区別 | [DB-21](#n-db-21) | KB / KC | 部分対応 | C cap4はtranscriptで検証。新native同経路のcap試験なし。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-22"></a>SA-22 | <code>retains final-four reservation at request cap 5</code> | fullNameで区別 | [DB-22](#n-db-22) | KB / KC | 部分対応 | C cap5はtranscriptで検証。新native同経路のcap試験なし。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-23"></a>SA-23 | <code>rejects the original attempt floor without making a new deadline</code> | fullNameで区別 | [DB-02](#n-db-02)、[DN-10](#n-dn-10) | KB / KC | 部分対応 | 同floorの関連試験。nativeの無取消floor→upstream写像を同条件では未検証。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-24"></a>SA-24 | <code>enforces a lowered hard deadline and cancels pending fake I/O without extending it</code> | fullNameで区別 | [DR-19](#n-dr-19)、[DN-11](#n-dn-11) | KB / KC | 部分対応 | 低減deadline／native run期限は別case。native低減10msの同条件なし。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-25"></a>SA-25 | <code>cannot attach a private status consumer to an existing session with a guessed key</code> | fullNameで区別 | [DR-20](#n-dr-20) | —（同一コードの共有なし） | 未対応 | 差分参照：開発rootの入力拒否は実sourceの推測key攻撃の代替ではない。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |
| <a id="o-sa-26"></a>SA-26 | <code>keeps the probe out of the runtime class and hands the friend out only once</code> | fullNameで区別 | — | —（同一コードの共有なし） | 未対応 | 旧runtime friendの二度目take拒否。新assembly対応でなく後続export不在検査へ要承認。 PC-01/02/04：実session・登録lease・実source継続とclose前受理は旧caseのみ。 |

### SAB — B-SA：実source境界

旧file：[source-status-binding-boundary.test.ts](../tests/review/source-status-binding-boundary.test.ts)、11件。別assemblyへの対応候補をcase単位に評価する群。旧caseは全件維持する。

| 行ID | 旧fullName | 入力条件（同名の識別） | 新case | 共有部分 | 分類 | 未代替の保証・残差 |
|---|---|---|---|---|---|---|
| <a id="o-sab-01"></a>SAB-01 | <code>refuses a terminal from another closed constructor without changing its history</code> | fullNameで区別 | [DN-16](#n-dn-16)、[DS-10](#n-ds-10) | KB / KC | 部分対応 | foreign拒否は部分対応。閉鎖済み実constructorのhistory不変までは未代替。 PC-01/02/04：実private consumer・登録ready世代・実class外側close境界は未代替。 |
| <a id="o-sab-02"></a>SAB-02 | <code>refuses copy consumption before returning any accepted summary</code> | fullNameで区別 | [DN-15](#n-dn-15) | KB / KC | 部分対応 | native proof copy拒否。実source terminalのdraft公開境界とは別。 PC-01/02/04：実private consumer・登録ready世代・実class外側close境界は未代替。 |
| <a id="o-sab-03"></a>SAB-03 | <code>refuses duplicate consumption before returning any accepted summary</code> | fullNameで区別 | [DN-19](#n-dn-19) | KB / KC | 部分対応 | 二重消費拒否。ただし旧二重呼出し時の未公開draft破棄／消費数とは別。 PC-01/02/04：実private consumer・登録ready世代・実class外側close境界は未代替。 |
| <a id="o-sab-04"></a>SAB-04 | <code>stops at cancel_pre and discards the unpublished result</code> | fullNameで区別 | [DN-20](#n-dn-20) | KB / KC | 部分対応 | 開発source pre-guard拒否とproof消費。実consumerは未代替。 PC-01/02/04：実private consumer・登録ready世代・実class外側close境界は未代替。 |
| <a id="o-sab-05"></a>SAB-05 | <code>stops at cancel_post and discards the unpublished result</code> | fullNameで区別 | [DN-28](#n-dn-28) | KB / KC | 部分対応 | 開発source post-guard拒否。旧draft返却経路は未代替。 PC-01/02/04：実private consumer・登録ready世代・実class外側close境界は未代替。 |
| <a id="o-sab-06"></a>SAB-06 | <code>cannot reuse the real source consumer after close or recover a permit from its draft</code> | fullNameで区別 | [DN-19](#n-dn-19)、[DS-17](#n-ds-17) | KB / KC | 部分対応 | proof／ackのclose後拒否。実source consumer／permit回収不可は旧caseのみ。 PC-01/02/04：実private consumer・登録ready世代・実class外側close境界は未代替。 |
| <a id="o-sab-07"></a>SAB-07 | <code>maps unexpected private-constructor failure to a fixed internal error and releases admission</code> | fullNameで区別 | [DR-05](#n-dr-05)、[DR-06](#n-dr-06)、[DR-07](#n-dr-07)、[DR-08](#n-dr-08)、[DR-09](#n-dr-09)、[DR-10](#n-dr-10)、[DR-11](#n-dr-11) | KC | 部分対応 | 開発の部分生成faultだけ。実private constructorの同故障注入・解放は未代替。 PC-01/02/04：実private consumer・登録ready世代・実class外側close境界は未代替。 |
| <a id="o-sab-08"></a>SAB-08 | <code>does not trust a successful-looking ready hook without the registered ready generation</code> | fullNameで区別 | [DS-07](#n-ds-07) | —（同一コードの共有なし） | 未対応 | 関連参照のみ：duplicate readyと、偽markReady成功／実登録世代の不一致は別。 PC-01/02/04：実private consumer・登録ready世代・実class外側close境界は未代替。 |
| <a id="o-sab-09"></a>SAB-09 | <code>checks revocation after draft construction before publishing acceptance</code> | fullNameで区別 | [DS-31](#n-ds-31)、[DN-28](#n-dn-28) | KB / KC | 部分対応 | callback失効／post-guardは部分対応。draft構築直後の公開専用境界は未移行。 PC-01/02/04：実private consumer・登録ready世代・実class外側close境界は未代替。 |
| <a id="o-sab-10"></a>SAB-10 | <code>does not publish a result cancelled between the private return and the outer close</code> | fullNameで区別 | — | —（同一コードの共有なし） | 未対応 | private return→外側closeのgap取消に対応する新caseなし。 PC-01/02/04：実private consumer・登録ready世代・実class外側close境界は未代替。 |
| <a id="o-sab-11"></a>SAB-11 | <code>checks the original attempt floor again after draft construction</code> | fullNameで区別 | [DN-10](#n-dn-10) | KB / KC | 未対応 | 関連参照のみ：cleanup floor打切りはdraft構築後の再clock検査の代替でない。 PC-01/02/04：実private consumer・登録ready世代・実class外側close境界は未代替。 |

### ND — B-ND：実session＋注入native

旧file：[native-session-composition.test.ts](../tests/review/native-session-composition.test.ts)、30件。別assemblyへの対応候補をcase単位に評価する群。旧caseは全件維持する。

| 行ID | 旧fullName | 入力条件（同名の識別） | 新case | 共有部分 | 分類 | 未代替の保証・残差 |
|---|---|---|---|---|---|---|
| <a id="o-nd-01"></a>ND-01 | <code>retains the sealed construction failure before the native owner is created</code> | fullNameで区別 | [DR-23](#n-dr-23)、[DR-24](#n-dr-24)、[DR-25](#n-dr-25) | KC | 部分対応 | scalar不正clockまで。旧初回clock throw→native null・実失敗copy回収の同caseは未移行。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-02"></a>ND-02 | <code>connects native cleanup and the sole consumer to a fresh real-class session/source before close</code> | fullNameで区別 | [DN-01](#n-dn-01) | KV-P / KB / KC | 部分対応 | 同reader→private source受理の相当経路。旧ND診断ownerとcleanup実装は別（KN）。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-03"></a>ND-03 | <code>accepts 403/body=true once, with no public release decision</code> | fullNameで区別 | [DN-01](#n-dn-01) | KV-P / KB / KC | 部分対応 | 403/body=trueの相当入力。実class／旧ND ownerは未代替（KN）。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-04"></a>ND-04 | <code>accepts 404/body=true once, with no public release decision</code> | fullNameで区別 | [DN-01](#n-dn-01)、[DN-03](#n-dn-03)、[DN-09](#n-dn-09) | KV-P / KB / KC | 部分対応 | body403とno_body404、取消body404の関連試験のみ。正常404/body=trueの新caseなし。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-05"></a>ND-05 | <code>accepts 403/body=false once, with no public release decision</code> | fullNameで区別 | [DN-02](#n-dn-02) | KV-P / KB / KC | 部分対応 | 403/no_body相当。旧ND全purpose slot／issue countは未移行（KN）。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-06"></a>ND-06 | <code>accepts 404/body=false once, with no public release decision</code> | fullNameで区別 | [DN-03](#n-dn-03) | KV-P / KB / KC | 部分対応 | 404/no_body相当。旧ND全purpose slot／issue countは未移行（KN）。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-07"></a>ND-07 | <code>preserves HTTP 401 and rejected cleanup through actual session closure</code> | fullNameで区別 | [DN-08](#n-dn-08) | KB / KC | 部分対応 | hard401＋cancel拒否の相当事実。実class外側closeと旧ND診断形状は別（KN）。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-08"></a>ND-08 | <code>preserves HTTP 403 and rejected cleanup through actual session closure</code> | fullNameで区別 | [DN-07](#n-dn-07) | KB / KC | 部分対応 | 403 cancel拒否。実class診断層・native issue数の同assertは未移行（KN）。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-09"></a>ND-09 | <code>keeps canonical responseBytes cap and diagnostics before native acquisition</code> | fullNameで区別 | [DB-27](#n-db-27) | KB / KC | 部分対応 | capはtranscript部分のみ。native取得前の低減response cap／上位slotは未対応。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-10"></a>ND-10 | <code>keeps canonical totalBytes cap and diagnostics before native acquisition</code> | fullNameで区別 | [DB-26](#n-db-26) | KB / KC | 部分対応 | capはtranscript部分のみ。native取得前の低減total cap／上位slotは未対応。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-11"></a>ND-11 | <code>keeps four final slots at request cap 4</code> | fullNameで区別 | [DB-21](#n-db-21) | KB / KC | 部分対応 | C cap4はtranscriptのみ。native同条件のdiagnostic assertionなし。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-12"></a>ND-12 | <code>keeps four final slots at request cap 5</code> | fullNameで区別 | [DB-22](#n-db-22) | KB / KC | 部分対応 | C cap5はtranscriptのみ。native同条件のdiagnostic assertionなし。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-13"></a>ND-13 | <code>retains invalid parent rejection before native acquisition 0</code> | fullNameで区別 | [DB-29](#n-db-29) | KB / KC（UTF-8解析は別実装） | 部分対応 | 不正UTF-8はtranscriptで検証。native取得前同入力は未網羅。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-14"></a>ND-14 | <code>retains invalid parent rejection before native acquisition 1</code> | fullNameで区別 | [DN-12](#n-dn-12) | KV-P / KB / KC | 部分対応 | parent={}拒否でnative取得0。実上位owner slotは未代替。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-15"></a>ND-15 | <code>retains invalid parent rejection before native acquisition 2</code> | fullNameで区別 | [DB-30](#n-db-30) | KV-P / KB / KC | 部分対応 | foreign親の関連試験。旧caseは必須列も欠けており同一入力ではない。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-16"></a>ND-16 | <code>synchronously revokes on external cancel, joins the same cleanup until the original boundary and retains late facts</code> | fullNameで区別 | [DN-09](#n-dn-09)、[DN-10](#n-dn-10) | KB / KC | 部分対応 | 取消join／late factsは相当。実sessionから旧ND上位ownerまでの保持は未代替。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-17"></a>ND-17 | <code>stops an already cancelled run before readiness or native creation and frees admission</code> | fullNameで区別 | [DN-12](#n-dn-12) | KB / KC | 部分対応 | 事前取消で取得0。実factoryの返却形状は旧caseのみ。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-18"></a>ND-18 | <code>uses the canonical clock and does not create a fresh cleanup deadline</code> | fullNameで区別 | [DN-10](#n-dn-10)、[DB-02](#n-db-02) | KB / KC | 部分対応 | 元floorは確認。無取消のnative floor越え→upstream写像の同caseなし。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-19"></a>ND-19 | <code>keeps deadline_exceeded only when the canonical run deadline itself is reached</code> | fullNameで区別 | [DN-11](#n-dn-11) | KB / KC | 部分対応 | run deadlineの相当事実。native制御理由はrun_stopと別保持し旧診断形状とは異なる。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-20"></a>ND-20 | <code>rejects reuse of the injected Response across fresh actual-class runs</code> | fullNameで区別 | [DN-13](#n-dn-13) | KB / KC | 部分対応 | 別root再使用拒否。旧actual-class registry／履歴保証は別（KN）。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-21"></a>ND-21 | <code>rejects caller session supply</code> | fullNameで区別 | — | —（同一コードの共有なし） | 未対応 | この名前のcaller fieldを同入口で拒否する新caseなし。固定schemaの存在だけで検証済みにしない。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-22"></a>ND-22 | <code>rejects caller consumer supply</code> | fullNameで区別 | — | —（同一コードの共有なし） | 未対応 | この名前のcaller fieldを同入口で拒否する新caseなし。固定schemaの存在だけで検証済みにしない。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-23"></a>ND-23 | <code>rejects caller driver supply</code> | fullNameで区別 | — | —（同一コードの共有なし） | 未対応 | この名前のcaller fieldを同入口で拒否する新caseなし。固定schemaの存在だけで検証済みにしない。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-24"></a>ND-24 | <code>rejects caller cleanup supply</code> | fullNameで区別 | [DN-14](#n-dn-14) | —（同一コードの共有なし） | 部分対応 | cleanup申告拒否は相当。旧caller cleanup supply入口は別。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-25"></a>ND-25 | <code>rejects caller binding supply</code> | fullNameで区別 | — | —（同一コードの共有なし） | 未対応 | この名前のcaller fieldを同入口で拒否する新caseなし。固定schemaの存在だけで検証済みにしない。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-26"></a>ND-26 | <code>rejects caller fetch supply</code> | fullNameで区別 | — | —（同一コードの共有なし） | 未対応 | この名前のcaller fieldを同入口で拒否する新caseなし。固定schemaの存在だけで検証済みにしない。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-27"></a>ND-27 | <code>returns frozen diagnostic copies with no live session/source/budget/consumer capabilities</code> | fullNameで区別 | [DR-21](#n-dr-21)、[DN-10](#n-dn-10) | KC | 部分対応 | 関連するfreeze／late不変まで。native結果の全recursive freeze／全handle不在の同caseなし。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-28"></a>ND-28 | <code>copies parent bytes with native accessors and never invokes shadow getters</code> | fullNameで区別 | [DN-22](#n-dn-22) | —（同一コードの共有なし） | 未対応 | 差分参照のみ：Response／stream shadow拒否はparent Uint8Array.byteLength shadowの代替でない。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-29"></a>ND-29 | <code>rejects proxy/accessor input and shared parent storage without exposing exception text</code> | fullNameで区別 | [DB-13](#n-db-13)、[DN-14](#n-dn-14) | —（同一コードの共有なし） | 部分対応 | proxy／shared／getter拒否は別profileの部分試験。旧native parent-storage全条件は未移行。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |
| <a id="o-nd-30"></a>ND-30 | <code>keeps the entry out of the runtime class and consumes the fresh-fake friend only once</code> | fullNameで区別 | — | —（同一コードの共有なし） | 未対応 | 旧native friendの一度限りtake。撤去・export不在検査は未実施。 PC-01/02/04：同実constructor／source／coreとND上位診断ownerは未代替。 |

### NDB — B-ND：実native/source境界

旧file：[native-session-boundary.test.ts](../tests/review/native-session-boundary.test.ts)、8件。別assemblyへの対応候補をcase単位に評価する群。旧caseは全件維持する。

| 行ID | 旧fullName | 入力条件（同名の識別） | 新case | 共有部分 | 分類 | 未代替の保証・残差 |
|---|---|---|---|---|---|---|
| <a id="o-ndb-01"></a>NDB-01 | <code>rejects a terminal from a different closed source/core without changing its diagnostic history</code> | fullNameで区別 | [DN-16](#n-dn-16)、[DN-19](#n-dn-19) | KB / KC | 部分対応 | foreign owner／closed proofの部分試験。別閉鎖済み実source/coreの履歴不変は未代替。 PC-01/02/04：実source consumerのdraft公開・外側close・登録世代検査は未代替。 |
| <a id="o-ndb-02"></a>NDB-02 | <code>rejects copy at the actual source boundary and retains both diagnostic layers</code> | fullNameで区別 | [DN-15](#n-dn-15) | KB / KC | 部分対応 | proof copy拒否。実source／ND二層診断への伝播は未代替。 PC-01/02/04：実source consumerのdraft公開・外側close・登録世代検査は未代替。 |
| <a id="o-ndb-03"></a>NDB-03 | <code>rejects duplicate at the actual source boundary and retains both diagnostic layers</code> | fullNameで区別 | [DN-19](#n-dn-19) | KB / KC | 部分対応 | 二重consume拒否。旧実draftのpublish取消条件・countとは別。 PC-01/02/04：実source consumerのdraft公開・外側close・登録世代検査は未代替。 |
| <a id="o-ndb-04"></a>NDB-04 | <code>discards unpublished drafts at cancel_pre and preserves cancellation</code> | fullNameで区別 | [DN-20](#n-dn-20) | KB / KC | 部分対応 | pre-guard拒否。実source consumer同位置の取消は旧caseのみ。 PC-01/02/04：実source consumerのdraft公開・外側close・登録世代検査は未代替。 |
| <a id="o-ndb-05"></a>NDB-05 | <code>discards unpublished drafts at cancel_post and preserves cancellation</code> | fullNameで区別 | [DN-28](#n-dn-28) | KB / KC | 部分対応 | post-guard拒否。実source consumer同位置の取消は旧caseのみ。 PC-01/02/04：実source consumerのdraft公開・外側close・登録世代検査は未代替。 |
| <a id="o-ndb-06"></a>NDB-06 | <code>discards unpublished drafts at cancel_gap and preserves cancellation</code> | fullNameで区別 | — | —（同一コードの共有なし） | 未対応 | private return後cancel_gapに対応する新caseなし。 PC-01/02/04：実source consumerのdraft公開・外側close・登録世代検査は未代替。 |
| <a id="o-ndb-07"></a>NDB-07 | <code>rejects all source consumers after close and does not return source/core identity handles</code> | fullNameで区別 | [DS-17](#n-ds-17)、[DN-19](#n-dn-19) | KB / KC | 部分対応 | 開発ack／proofのclose後拒否まで。実consumerのpost-close拒否は未代替。 PC-01/02/04：実source consumerのdraft公開・外側close・登録世代検査は未代替。 |
| <a id="o-ndb-08"></a>NDB-08 | <code>does not trust a successful-looking ready callback without the same registered generation</code> | fullNameで区別 | [DS-07](#n-ds-07) | —（同一コードの共有なし） | 未対応 | 関連参照のみ：独立ready one-shotは偽callback成功と実登録世代の検査を代替しない。 PC-01/02/04：実source consumerのdraft公開・外側close・登録世代検査は未代替。 |

### ACK — B-ACK：200 ack・release判断

旧file：[private-composition-ack.test.ts](../tests/review/private-composition-ack.test.ts)、37件。別assemblyへの対応候補をcase単位に評価する群。旧caseは全件維持する。

| 行ID | 旧fullName | 入力条件（同名の識別） | 新case | 共有部分 | 分類 | 未代替の保証・残差 |
|---|---|---|---|---|---|---|
| <a id="o-ack-01"></a>ACK-01 | <code>accepts parent/release acks from the same byte budget and real source release decision, then closes without authority</code> | fullNameで区別 | [DB-01](#n-db-01)、[DS-32](#n-ds-32) | KV-P / KV-R / KB / KC | 部分対応 | bytes会計／値受理のみ。C方式判断・実permit／prepared結合はnot_evaluated。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-02"></a>ACK-02 | <code>never reenters legacy GET or the source public acquisition methods, and ignores public observation replacements</code> | fullNameで区別 | [DB-17](#n-db-17) | KB / KC | 部分対応 | 非干渉／network非使用まで。旧stats等の置換・全公開method spyは未移行。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-03"></a>ACK-03 | <code>derives cached authentication from the pinned snapshot and keeps its bytes in one budget</code> | fullNameで区別 | [DB-19](#n-db-19) | KB / KC | 部分対応 | cachedは合成auth指定。実snapshotからcache期限を導出する保証は未代替。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-04"></a>ACK-04 | <code>derives exchange authentication from the pinned snapshot and keeps its bytes in one budget</code> | fullNameで区別 | [DB-20](#n-db-20) | KB / KC | 部分対応 | exchange会計は合成指定。実snapshotからmodeを導出する保証は未代替。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-05"></a>ACK-05 | <code>stops invalid OAuth before parent readiness: {"access_token":""}</code> | fullNameで区別 | [DB-32](#n-db-32) | KB / KC | 部分対応 | 合成token空値を拒否。実認証snapshotの検証ではない。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-06"></a>ACK-06 | <code>stops invalid OAuth before parent readiness: {"expires_in":0}</code> | fullNameで区別 | [DB-33](#n-db-33) | KB / KC | 部分対応 | 新caseはexpires_in=60の等号。旧expires_in=0と同一境界ではない。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-07"></a>ACK-07 | <code>stops invalid OAuth before parent readiness: {"token_type":"mac"}</code> | fullNameで区別 | [DB-34](#n-db-34) | KB / KC | 部分対応 | token_type mac拒否。実classからのready失敗伝播は旧caseのみ。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-08"></a>ACK-08 | <code>does not prepare a non-admitted release observation</code> | Zurichのみ | — | KV-R（値projectionのみ） | 未対応 | releaseのfamily／不完全／上限判断は未移行。値受理とnot_evaluatedを不許可判定へ読み替えない。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-09"></a>ACK-09 | <code>does not prepare a non-admitted release observation</code> | 未知family nonsense | — | KV-R（値projectionのみ） | 未対応 | releaseのfamily／不完全／上限判断は未移行。値受理とnot_evaluatedを不許可判定へ読み替えない。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-10"></a>ACK-10 | <code>does not prepare a non-admitted release observation</code> | build_name=null | — | KV-R（値projectionのみ） | 未対応 | releaseのfamily／不完全／上限判断は未移行。値受理とnot_evaluatedを不許可判定へ読み替えない。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-11"></a>ACK-11 | <code>does not prepare a non-admitted release observation</code> | result=[] | — | KV-R（値projectionのみ） | 未対応 | releaseのfamily／不完全／上限判断は未移行。値受理とnot_evaluatedを不許可判定へ読み替えない。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-12"></a>ACK-12 | <code>does not prepare a non-admitted release observation</code> | Australia＋Zurich | — | KV-R（値projectionのみ） | 未対応 | releaseのfamily／不完全／上限判断は未移行。値受理とnot_evaluatedを不許可判定へ読み替えない。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-13"></a>ACK-13 | <code>does not prepare a non-admitted release observation</code> | Australia 21行 | — | KV-R（値projectionのみ） | 未対応 | releaseのfamily／不完全／上限判断は未移行。値受理とnot_evaluatedを不許可判定へ読み替えない。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-14"></a>ACK-14 | <code>projects only build_name and does not retain unexpected node addresses or certificates</code> | fullNameで区別 | [SV-08](#n-sv-08)、[DS-01](#n-ds-01) | KV-R | 部分対応 | build_name projection共有のみ。trim・family確定・release evidence／limitationsは未移行。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-15"></a>ACK-15 | <code>uses the existing C-mode assertion only for a complete empty 200 observation</code> | fullNameで区別 | — | —（同一コードの共有なし） | 未対応 | operator config入力／空200のC方式判断が新assemblyにない。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-16"></a>ACK-16 | <code>keeps measured/configured conflicts closed rather than trusting a supplied family</code> | fullNameで区別 | — | —（同一コードの共有なし） | 未対応 | 実測と設定familyの競合判定が未移行。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-17"></a>ACK-17 | <code>rejects invalid parent bytes before release binding</code> | 異なるsys_id | [DB-30](#n-db-30) | KV-P / KB | 部分対応 | foreign親の関連試験。実release binding前であることは未代替。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-18"></a>ACK-18 | <code>rejects invalid parent bytes before release binding</code> | sys_mod_count欠落 | [SV-03](#n-sv-03)、[DB-30](#n-db-30) | KV-P | 部分対応 | strict親拒否は共有。sys_mod_countだけ欠落させる同一入力の新caseなし。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-19"></a>ACK-19 | <code>rejects invalid parent bytes before release binding</code> | 余剰script列 | [DB-31](#n-db-31) | KV-P / KB | 部分対応 | 余剰script拒否は相当。実release bindingは旧caseのみ。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-20"></a>ACK-20 | <code>rejects malformed JSON/UTF8 without exposing bytes</code> | 不正UTF-8: c3 28 | [DB-29](#n-db-29) | KB | 部分対応 | 不正UTF-8族の関連試験。旧byte列c3 28とは異なる。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-21"></a>ACK-21 | <code>rejects malformed JSON/UTF8 without exposing bytes</code> | UTF-8有効・不正JSON文字列 | — | —（同一コードの共有なし） | 未対応 | 不正JSON文字列（UTF-8自体は有効）の新caseなし。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-22"></a>ACK-22 | <code>pins the entire transcript before awaiting and never reparses caller-mutated bytes</code> | fullNameで区別 | [DB-35](#n-db-35) | KB / KC | 部分対応 | copy-before-await相当。pin実装は別、実source bindingは未代替。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-23"></a>ACK-23 | <code>cancels a pending fake parent and frees all timers/admission without resuming</code> | fullNameで区別 | [DB-36](#n-db-36) | KB / KC | 部分対応 | parent delay取消の相当試験。実class cleanupは旧caseのみ。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-24"></a>ACK-24 | <code>cancels a pending fake release and frees all timers/admission without resuming</code> | fullNameで区別 | [DB-37](#n-db-37) | KB / KC | 部分対応 | release delay取消の相当試験。実class cleanupは旧caseのみ。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-25"></a>ACK-25 | <code>keeps a lowered totalBytes cap and closes after a charged overshoot</code> | fullNameで区別 | [DB-26](#n-db-26) | KB / KC | 部分対応 | total cap／課金後超過の相当境界。実class bindingは別。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-26"></a>ACK-26 | <code>keeps a lowered responseBytes cap and closes after a charged overshoot</code> | fullNameで区別 | [DB-27](#n-db-27) | KB / KC | 部分対応 | response cap／課金後超過の相当境界。実class bindingは別。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-27"></a>ACK-27 | <code>does not consume final-four capacity with C cap 4</code> | fullNameで区別 | [DB-21](#n-db-21) | KB / KC | 部分対応 | final4予約・cap4相当。登録ownerへの結合は未代替。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-28"></a>ACK-28 | <code>does not consume final-four capacity with C cap 5</code> | fullNameで区別 | [DB-22](#n-db-22) | KB / KC | 部分対応 | final4予約・cap5相当。登録ownerへの結合は未代替。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-29"></a>ACK-29 | <code>does not upgrade raw release decisions/permits encoded as response JSON</code> | fullNameで区別 | [DS-21](#n-ds-21) | —（同一コードの共有なし） | 未対応 | 差分参照のみ：新版のenvelope拒否と旧release_not_admitted／permit偽装拒否は別。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-30"></a>ACK-30 | <code>rejects non-data/unsupported transcript shapes before dispatch</code> | 空object | [DB-08](#n-db-08) | —（同一コードの共有なし） | 部分対応 | 空transcript拒否の相当境界。別schema／別root。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-31"></a>ACK-31 | <code>rejects non-data/unsupported transcript shapes before dispatch</code> | 親・release・releaseの3応答 | — | —（同一コードの共有なし） | 未対応 | 親・release・releaseの3応答（余剰release／順序不正）を同じ入力で検査する新caseなし。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-32"></a>ACK-32 | <code>rejects non-data/unsupported transcript shapes before dispatch</code> | dispatch=function追加 | [DB-13](#n-db-13) | —（同一コードの共有なし） | 部分対応 | dispatch callback field拒否の相当境界。別schema／別root。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-33"></a>ACK-33 | <code>rejects non-data/unsupported transcript shapes before dispatch</code> | status=403 field追加 | [DB-06](#n-db-06) | —（同一コードの共有なし） | 部分対応 | status field拒否の相当境界。別schema／別root。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-34"></a>ACK-34 | <code>cannot retrieve a consumer or adopt an existing session with a guessed construction key</code> | fullNameで区別 | — | —（同一コードの共有なし） | 未対応 | 推測construction keyで実consumerを取得／既存session採用する試験は旧caseのみ。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-35"></a>ACK-35 | <code>does not trust a replaced static verifier or expose a private source consumer</code> | fullNameで区別 | — | —（同一コードの共有なし） | 未対応 | 実class static verifier置換を無視する新caseなし。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-36"></a>ACK-36 | <code>requires the actual private source-to-owner binding instead of accepting a successful-looking hook</code> | fullNameで区別 | — | —（同一コードの共有なし） | 未対応 | 実source→owner bind成功偽装を見抜く保証はrelease／本番binding未移行。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |
| <a id="o-ack-37"></a>ACK-37 | <code>rejects hard deadline equality after dispatch and clears delayed fake I/O</code> | fullNameで区別 | [DB-04](#n-db-04) | KB / KC | 部分対応 | dispatch後hard deadline相当。実class close／release判断は未代替。 PC-01/02/03：実認証snapshot・実source private ack・C方式判断／permit結合は未代替。 |

### ACKB — B-ACK：実200経路の境界

旧file：[private-composition-boundary.test.ts](../tests/review/private-composition-boundary.test.ts)、2件。別assemblyへの対応候補をcase単位に評価する群。旧caseは全件維持する。

| 行ID | 旧fullName | 入力条件（同名の識別） | 新case | 共有部分 | 分類 | 未代替の保証・残差 |
|---|---|---|---|---|---|---|
| <a id="o-ackb-01"></a>ACKB-01 | <code>keeps a non-stopping phase cutoff raised by the session guard after parent acceptance as phase_deadline_exceeded</code> | fullNameで区別 | [DB-03](#n-db-03) | KB / KC | 未対応 | 差分参照のみ：待機時cutoffでは親受理後の非停止guard理由保持を代替しない。 PC-01/03/04：実source受理後guardと非200→release判断の遮断は旧caseのみ。 |
| <a id="o-ackb-02"></a>ACKB-02 | <code>refuses a non-200 release before the source can treat a missing body as an observation</code> | fullNameで区別 | [DB-06](#n-db-06) | —（同一コードの共有なし） | 未対応 | 差分参照のみ：status入力の事前拒否と、dispatch後非200をfallback前に拒否する旧caseは別。 PC-01/03/04：実source受理後guardと非200→release判断の遮断は旧caseのみ。 |

### FR — B-FRIEND：旧friend入口

旧file：[source-status-probe-friend.test.ts](../tests/review/source-status-probe-friend.test.ts)、6件。別assemblyへの対応候補をcase単位に評価する群。旧caseは全件維持する。

| 行ID | 旧fullName | 入力条件（同名の識別） | 新case | 共有部分 | 分類 | 未代替の保証・残差 |
|---|---|---|---|---|---|---|
| <a id="o-fr-01"></a>FR-01 | <code>accepts a pinned fake through the one-shot friend and refuses a second take</code> | fullNameで区別 | — | —（同一コードの共有なし） | 未対応 | take成功／二度目拒否は後続export不在検査へ。現時点でfriendは残す。 旧friend固有の受付／一度限りtakeの保証。撤去・export不在検査はEF-03C/Dで別承認。 |
| <a id="o-fr-02"></a>FR-02 | <code>rejects a missing method from a caller-built fake without accepting</code> | fullNameで区別 | — | —（同一コードの共有なし） | 未対応 | 旧caller-built fakeのmethod／観測schemaに対応する同一入力の新caseなし。入口撤去を試験移行完了としない。 旧friend固有の受付／一度限りtakeの保証。撤去・export不在検査はEF-03C/Dで別承認。 |
| <a id="o-fr-03"></a>FR-03 | <code>rejects a non-byte parent from a caller-built fake without accepting</code> | fullNameで区別 | — | —（同一コードの共有なし） | 未対応 | 旧caller-built fakeのmethod／観測schemaに対応する同一入力の新caseなし。入口撤去を試験移行完了としない。 旧friend固有の受付／一度限りtakeの保証。撤去・export不在検査はEF-03C/Dで別承認。 |
| <a id="o-fr-04"></a>FR-04 | <code>rejects a extra observation key from a caller-built fake without accepting</code> | fullNameで区別 | — | —（同一コードの共有なし） | 未対応 | 旧caller-built fakeのmethod／観測schemaに対応する同一入力の新caseなし。入口撤去を試験移行完了としない。 旧friend固有の受付／一度限りtakeの保証。撤去・export不在検査はEF-03C/Dで別承認。 |
| <a id="o-fr-05"></a>FR-05 | <code>rejects a non-candidate status from a caller-built fake without accepting</code> | fullNameで区別 | [DN-05](#n-dn-05) | —（同一コードの共有なし） | 部分対応 | status200拒否は部分類似。旧fake観測型と新Response cleanup経路は異なる。 旧friend固有の受付／一度限りtakeの保証。撤去・export不在検査はEF-03C/Dで別承認。 |
| <a id="o-fr-06"></a>FR-06 | <code>rejects a accessor observation from a caller-built fake without accepting</code> | fullNameで区別 | — | —（同一コードの共有なし） | 未対応 | 旧caller-built fakeのmethod／観測schemaに対応する同一入力の新caseなし。入口撤去を試験移行完了としない。 旧friend固有の受付／一度限りtakeの保証。撤去・export不在検査はEF-03C/Dで別承認。 |

### KEEP — B-KEEP：そのまま維持する通常構築経路

旧file：[private-composition.test.ts](../tests/review/private-composition.test.ts)、35件。旧位置で維持する群。特定の新caseへの置換を行わない。

| 行ID | 旧fullName | 入力条件（同名の識別） | 新case | 共有部分 | 分類 | 未代替の保証・残差 |
|---|---|---|---|---|---|---|
| <a id="o-keep-01"></a>KEEP-01 | <code>binds a fresh session, its registered lease and fixed source before any authentication or I/O, then closes</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-02"></a>KEEP-02 | <code>ignores public observation replacements rather than using them as budget authority</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-03"></a>KEEP-03 | <code>returns only a deeply frozen limited summary, with no work callback or live authority</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-04"></a>KEEP-04 | <code>rejects malformed or session-shaped input before allocating a run: {}</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-05"></a>KEEP-05 | <code>rejects malformed or session-shaped input before allocating a run: {"update_set_sys_id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","session":{}}</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-06"></a>KEEP-06 | <code>rejects malformed or session-shaped input before allocating a run: {"update_set_sys_id":"bad"}</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-07"></a>KEEP-07 | <code>rejects malformed or session-shaped input before allocating a run: {"update_set_sys_id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","max_records":101}</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-08"></a>KEEP-08 | <code>rejects injection/mode options rather than exposing a transport switch</code> | fetch=function | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-09"></a>KEEP-09 | <code>rejects injection/mode options rather than exposing a transport switch</code> | native_body=true | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-10"></a>KEEP-10 | <code>rejects injection/mode options rather than exposing a transport switch</code> | signal accessor | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-11"></a>KEEP-11 | <code>releases constructor resources after cancellation and permits a separate new run</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-12"></a>KEEP-12 | <code>stops and releases if cancellation arrives while its registered lease is sampled</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-13"></a>KEEP-13 | <code>rejects a soft/hard deadline crossed during constructor binding at 50000 without I/O</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-14"></a>KEEP-14 | <code>rejects a soft/hard deadline crossed during constructor binding at 60000 without I/O</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-15"></a>KEEP-15 | <code>keeps the lowered cap and closes on an insufficient final-four allocation</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-16"></a>KEEP-16 | <code>consumes initial binding once and cannot remint it after the first refusal</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-17"></a>KEEP-17 | <code>rejects a foreign snapshot without mutating the foreign owner</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-18"></a>KEEP-18 | <code>rejects a foreign lease without mutating the foreign owner</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-19"></a>KEEP-19 | <code>rejects a foreign handle without mutating the foreign owner</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-20"></a>KEEP-20 | <code>distinguishes initial source identity from a ReleasePermit and rejects a later foreign source</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-21"></a>KEEP-21 | <code>rejects initial binding after ready and after close</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-22"></a>KEEP-22 | <code>consumes initial binding before a lease callback can reenter</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-23"></a>KEEP-23 | <code>cannot adopt or switch an existing session, which keeps its ordinary legacy writer</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-24"></a>KEEP-24 | <code>rejects an invalid signal before constructor admission can be allocated</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-25"></a>KEEP-25 | <code>rejects signal callback replacements before allocation instead of invoking them</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-26"></a>KEEP-26 | <code>uses its fixed private cleanup rather than a replaced public close method</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-27"></a>KEEP-27 | <code>rejects an accessor snapshot perUserBearerToken without reading it, so validation and storage cannot diverge</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-28"></a>KEEP-28 | <code>rejects an accessor snapshot instanceUrl without reading it, so validation and storage cannot diverge</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-29"></a>KEEP-29 | <code>rejects an accessor snapshot authMode without reading it, so validation and storage cannot diverge</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-30"></a>KEEP-30 | <code>rejects an accessor snapshot oauth without reading it, so validation and storage cannot diverge</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-31"></a>KEEP-31 | <code>rejects a proxy snapshot before allocating a run</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-32"></a>KEEP-32 | <code>rejects a class snapshot before allocating a run</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-33"></a>KEEP-33 | <code>rejects a unknown snapshot key before allocating a run</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-34"></a>KEEP-34 | <code>rejects a accessor oauth field before allocating a run</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |
| <a id="o-keep-35"></a>KEEP-35 | <code>rejects a unknown oauth key before allocating a run</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 PC-01/02：元の実class／登録owner／sourceの構築・通常経路を本caseで維持。別assemblyによる代替なし。 |

### UN — B-UNIT：旧注入native診断unit

旧file：[native-diagnostic-workflow.test.ts](../tests/review/native-diagnostic-workflow.test.ts)、62件。別assemblyへの対応候補をcase単位に評価する群。旧caseは全件維持する。

| 行ID | 旧fullName | 入力条件（同名の識別） | 新case | 共有部分 | 分類 | 未代替の保証・残差 |
|---|---|---|---|---|---|---|
| <a id="o-un-01"></a>UN-01 | <code>binds diagnostics before observation and connects one same-reader terminal to the sole consumer</code> | fullNameで区別 | [DN-01](#n-dn-01) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | 同reader→source受理は部分類似。旧上位ownerの3purpose slot／sealは未代替。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-02"></a>UN-02 | <code>consumes release403 body=true with native no-body distinct from EOF</code> | fullNameで区別 | [DN-01](#n-dn-01) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | 正常403/body=trueの相当経路。旧ND consumerと診断履歴は別。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-03"></a>UN-03 | <code>consumes release404 body=true with native no-body distinct from EOF</code> | fullNameで区別 | [DN-01](#n-dn-01)、[DN-03](#n-dn-03) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | 403/bodyと404/no_bodyの関連試験のみ。正常404/body=trueは未追加。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-04"></a>UN-04 | <code>consumes release403 body=false with native no-body distinct from EOF</code> | fullNameで区別 | [DN-02](#n-dn-02) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | 403/no_body相当。旧ownerのissue／consume count形状は未移行。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-05"></a>UN-05 | <code>consumes release404 body=false with native no-body distinct from EOF</code> | fullNameで区別 | [DN-03](#n-dn-03) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | 404/no_body相当。旧ownerのissue／consume count形状は未移行。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-06"></a>UN-06 | <code>keeps hard401 and cleanup independently (body=true) without issuance</code> | fullNameで区別 | [DN-08](#n-dn-08) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | hard401/bodyとcleanupの二軸。旧ND上位owner形状は別。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-07"></a>UN-07 | <code>keeps hard401 and cleanup independently (body=false) without issuance</code> | fullNameで区別 | [DN-04](#n-dn-04)、[DN-02](#n-dn-02) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | hard401/bodyとno_body403の関連参照のみ。hard401/no_bodyの同一caseなし。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-08"></a>UN-08 | <code>preserves HTTP401 before native cancel rejection and never issues</code> | fullNameで区別 | [DN-08](#n-dn-08) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | hard401＋cancel拒否の相当事実。旧ownerの発行数／上位slotは未移行。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-09"></a>UN-09 | <code>preserves HTTP403 before native cancel rejection and never issues</code> | fullNameで区別 | [DN-07](#n-dn-07) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | 403＋cancel拒否。旧ownerの発行数／上位slotは未移行。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-10"></a>UN-10 | <code>does not upgrade timed-out cleanup when cancellation resolves late</code> | fullNameで区別 | [DN-10](#n-dn-10) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | 元floorとlate settle不昇格は相当。旧fixtureのsealed履歴は別。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-11"></a>UN-11 | <code>refuses cancellation at issue without losing native facts</code> | fullNameで区別 | — | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | issue時点に限定した取消の新caseなし。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-12"></a>UN-12 | <code>refuses cancellation at pre_guard without losing native facts</code> | fullNameで区別 | [DN-20](#n-dn-20) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | source pre-guard取消は部分類似。native issuer自身のpre-guardとは別境界。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-13"></a>UN-13 | <code>refuses cancellation at post_guard without losing native facts</code> | fullNameで区別 | [DN-28](#n-dn-28) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | source post-guard取消は部分類似。native issuer自身のpost-guardとは別境界。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-14"></a>UN-14 | <code>rejects equality at the original floor in issue</code> | fullNameで区別 | [DN-10](#n-dn-10) | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | 差分参照のみ：cleanup待機のfloor等号はissue／pre／postの各点の等号試験でない。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-15"></a>UN-15 | <code>rejects equality at the original floor in pre_guard</code> | fullNameで区別 | [DN-10](#n-dn-10) | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | 差分参照のみ：cleanup待機のfloor等号はissue／pre／postの各点の等号試験でない。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-16"></a>UN-16 | <code>rejects equality at the original floor in post_guard</code> | fullNameで区別 | [DN-10](#n-dn-10) | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | 差分参照のみ：cleanup待機のfloor等号はissue／pre／postの各点の等号試験でない。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-17"></a>UN-17 | <code>fails closed on reentry at issue with one cleanup</code> | fullNameで区別 | [DS-15](#n-ds-15) | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | 差分参照のみ：body ackのguard再入とnative issuer各段階の再入は別。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-18"></a>UN-18 | <code>fails closed on reentry at pre_guard with one cleanup</code> | fullNameで区別 | [DS-15](#n-ds-15) | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | 差分参照のみ：body ackのguard再入とnative issuer各段階の再入は別。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-19"></a>UN-19 | <code>fails closed on reentry at post_guard with one cleanup</code> | fullNameで区別 | [DS-15](#n-ds-15) | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | 差分参照のみ：body ackのguard再入とnative issuer各段階の再入は別。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-20"></a>UN-20 | <code>explicitly refuses owner/Response reuse after success without rewriting sealed history</code> | fullNameで区別 | [DN-13](#n-dn-13)、[DN-19](#n-dn-19) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | Response再使用／proof close後拒否まで。owner.execute再利用と旧sealed履歴の同assertなし。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-21"></a>UN-21 | <code>observes and releases exactly the same reader without reading any payload</code> | fullNameで区別 | [DN-01](#n-dn-01) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | 同reader固定操作数・read=0。旧consumer履歴は別。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-22"></a>UN-22 | <code>retains native reader failure with no issuance and no secret output</code> | fullNameで区別 | [DN-25](#n-dn-25) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | getReader故障注入の相当事実。別realm／別issuer。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-23"></a>UN-23 | <code>retains native closed failure with no issuance and no secret output</code> | fullNameで区別 | [DN-26](#n-dn-26) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | closed取得故障注入の相当事実。別realm／別issuer。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-24"></a>UN-24 | <code>retains native release failure with no issuance and no secret output</code> | fullNameで区別 | [DN-27](#n-dn-27) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | releaseLock故障注入の相当事実。別realm／別issuer。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-25"></a>UN-25 | <code>retains native closed_rejected failure with no issuance and no secret output</code> | fullNameで区別 | [DN-24](#n-dn-24) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | errored streamのclosed/cancel拒否まで。旧closed_rejected注入の同条件ではない。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-26"></a>UN-26 | <code>joins cancel/close with pending native cleanup and freezes an unconfirmed terminal</code> | fullNameで区別 | [DN-09](#n-dn-09)、[DN-10](#n-dn-10) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | stop後join・未確認factsまで。旧close経路／sealed ownerは別。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-27"></a>UN-27 | <code>does not infer non-200 semantics or issue from HTTP200</code> | fullNameで区別 | [DN-05](#n-dn-05) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | 200診断のみ。別ownerでcode／cleanupを保持する。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-28"></a>UN-28 | <code>does not infer non-200 semantics or issue from HTTP302</code> | fullNameで区別 | — | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | 302の新caseなし。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-29"></a>UN-29 | <code>does not infer non-200 semantics or issue from HTTP500</code> | fullNameで区別 | [DN-06](#n-dn-06) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | 500診断のみ。一般HTTP意味論を共有したことにはしない。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-30"></a>UN-30 | <code>sanitizes clock failure at issue</code> | fullNameで区別 | — | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | issue／pre／postに限定したclock throwの新caseなし。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-31"></a>UN-31 | <code>sanitizes clock failure at pre_guard</code> | fullNameで区別 | — | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | issue／pre／postに限定したclock throwの新caseなし。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-32"></a>UN-32 | <code>sanitizes clock failure at post_guard</code> | fullNameで区別 | — | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | issue／pre／postに限定したclock throwの新caseなし。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-33"></a>UN-33 | <code>does not reset monotonic sampling between cleanup, issue and pre/post guards</code> | fullNameで区別 | [DR-26](#n-dr-26) | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | 差分参照のみ：構築時canonical不正clockはcleanup→issue→guard間のrewind試験でない。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-34"></a>UN-34 | <code>stops on schedule_throw without native retry</code> | fullNameで区別 | — | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | native cleanup scheduler throwの新caseなし。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-35"></a>UN-35 | <code>stops on dispose_throw without native retry</code> | fullNameで区別 | — | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | native cleanup timer disposer throwの新caseなし。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-36"></a>UN-36 | <code>returns recursively frozen non-authoritative data without native handles or adopt/consumer ports</code> | fullNameで区別 | [DR-21](#n-dr-21)、[DN-10](#n-dn-10) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | freeze／late copyの部分比較。native全階層freezeと全handle不在の同assertなし。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-37"></a>UN-37 | <code>rejects constructor supply of session before native or clock operations</code> | fullNameで区別 | — | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | このcaller fieldのconstructor入力拒否を同条件で試す新caseなし。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-38"></a>UN-38 | <code>rejects constructor supply of consumer before native or clock operations</code> | fullNameで区別 | — | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | このcaller fieldのconstructor入力拒否を同条件で試す新caseなし。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-39"></a>UN-39 | <code>rejects constructor supply of cleanup before native or clock operations</code> | fullNameで区別 | [DN-14](#n-dn-14) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | 外部cleanup object拒否は類似。旧constructor入力schemaとは別。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-40"></a>UN-40 | <code>rejects constructor supply of anchor before native or clock operations</code> | fullNameで区別 | — | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | このcaller fieldのconstructor入力拒否を同条件で試す新caseなし。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-41"></a>UN-41 | <code>rejects constructor supply of terminal before native or clock operations</code> | fullNameで区別 | — | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | このcaller fieldのconstructor入力拒否を同条件で試す新caseなし。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-42"></a>UN-42 | <code>rejects constructor supply of context before native or clock operations</code> | fullNameで区別 | — | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | このcaller fieldのconstructor入力拒否を同条件で試す新caseなし。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-43"></a>UN-43 | <code>rejects constructor supply of callback before native or clock operations</code> | fullNameで区別 | — | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | このcaller fieldのconstructor入力拒否を同条件で試す新caseなし。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-44"></a>UN-44 | <code>rejects invalid descriptor 0 before observing Response</code> | fullNameで区別 | — | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | 新rootはdescriptorを内部生成。旧不正descriptor各入力の独立新caseはない。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-45"></a>UN-45 | <code>rejects invalid descriptor 1 before observing Response</code> | fullNameで区別 | — | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | 新rootはdescriptorを内部生成。旧不正descriptor各入力の独立新caseはない。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-46"></a>UN-46 | <code>rejects invalid descriptor 2 before observing Response</code> | fullNameで区別 | — | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | 新rootはdescriptorを内部生成。旧不正descriptor各入力の独立新caseはない。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-47"></a>UN-47 | <code>rejects invalid descriptor 3 before observing Response</code> | fullNameで区別 | — | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | 新rootはdescriptorを内部生成。旧不正descriptor各入力の独立新caseはない。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-48"></a>UN-48 | <code>rejects invalid descriptor 4 before observing Response</code> | fullNameで区別 | — | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | 新rootはdescriptorを内部生成。旧不正descriptor各入力の独立新caseはない。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-49"></a>UN-49 | <code>rejects invalid descriptor 5 before observing Response</code> | fullNameで区別 | — | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | 新rootはdescriptorを内部生成。旧不正descriptor各入力の独立新caseはない。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-50"></a>UN-50 | <code>rejects invalid descriptor 6 before observing Response</code> | fullNameで区別 | — | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | 新rootはdescriptorを内部生成。旧不正descriptor各入力の独立新caseはない。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-51"></a>UN-51 | <code>rejects invalid descriptor 7 before observing Response</code> | fullNameで区別 | — | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | 新rootはdescriptorを内部生成。旧不正descriptor各入力の独立新caseはない。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-52"></a>UN-52 | <code>rejects descriptor/constructor proxies and accessors without invoking traps</code> | fullNameで区別 | [DN-14](#n-dn-14) | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | 差分参照のみ：delivery profile getter拒否はdescriptor／budget constructorのgetter拒否と別。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-53"></a>UN-53 | <code>rejects private provenance mismatch copy_terminal after spending its own consume claim</code> | fullNameで区別 | [DN-15](#n-dn-15) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | proof copy拒否の相当境界。旧terminal私有構造は別。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-54"></a>UN-54 | <code>rejects private provenance mismatch foreign_terminal after spending its own consume claim</code> | fullNameで区別 | [DN-16](#n-dn-16) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | foreign owner/proof拒否。旧terminal私有構造は別。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-55"></a>UN-55 | <code>rejects private provenance mismatch copy_cleanup after spending its own consume claim</code> | fullNameで区別 | [DN-14](#n-dn-14) | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | 差分参照のみ：外部cleanup申告の早期拒否はprivate cleanup clone混入faultでない。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-56"></a>UN-56 | <code>rejects private provenance mismatch foreign_anchor after spending its own consume claim</code> | fullNameで区別 | [DN-17](#n-dn-17) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | 元window同一性まで。旧anchor全体のprivate入替faultは未移行。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-57"></a>UN-57 | <code>rejects a second private consumer invocation without erasing prior non-executable acceptance</code> | fullNameで区別 | [DN-19](#n-dn-19) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | 二重consume拒否まで。旧accepted historyの保持形式は別。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-58"></a>UN-58 | <code>does not accept fault controls or copied diagnostic supply at the injection-only constructor</code> | fullNameで区別 | [DN-14](#n-dn-14) | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | 差分参照のみ：診断／field拒否の関連試験。旧fault controlsの全入力caseは未移行。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-59"></a>UN-59 | <code>handles a rejected Promise returned by the synchronous budget boundary</code> | fullNameで区別 | — | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | 同期budget境界が返すrejected Promiseの新caseなし。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-60"></a>UN-60 | <code>handles a rejected Promise returned by the synchronous scheduler boundary</code> | fullNameで区別 | — | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | 同期scheduler境界が返すrejected Promiseの新caseなし。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-61"></a>UN-61 | <code>keeps public stop fixed to cancellation rather than accepting an injected reason</code> | fullNameで区別 | — | KN（仕様類似のみ／旧ND実装とは非共通） | 未対応 | 旧public stopの任意理由注入拒否は新入口の同一試験なし。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |
| <a id="o-un-62"></a>UN-62 | <code>keeps waiting after stop and confirms a cleanup that settles inside the original floor, without issuance</code> | fullNameで区別 | [DN-09](#n-dn-09) | KN（仕様類似のみ／旧ND実装とは非共通） | 部分対応 | 取消後同floor内でcleanupが確定し受理しない相当事実。旧ND issuerは別。 実class正式bindingは本caseの対象外。旧ND owner固有の診断・fault・import時friend依存は未移行。 |

### US — B-UNIT：旧synthetic status受理unit

旧file：[source-status-acceptance.test.ts](../tests/review/source-status-acceptance.test.ts)、60件。旧位置で維持する群。特定の新caseへの置換を行わない。

| 行ID | 旧fullName | 入力条件（同名の識別） | 新case | 共有部分 | 分類 | 未代替の保証・残差 |
|---|---|---|---|---|---|---|
| <a id="o-us-01"></a>US-01 | <code>consumes once before close and retains only a non-executable closed-gate history</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-02"></a>US-02 | <code>refuses duplicate consumption without changing the first accepted history</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-03"></a>US-03 | <code>spends the local claim on a foreign token, prevents retry and leaves the foreign issuer unchanged</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-04"></a>US-04 | <code>rejects foreign session binding without affecting its issuer</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-05"></a>US-05 | <code>rejects foreign constructor_key binding without affecting its issuer</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-06"></a>US-06 | <code>rejects foreign snapshot binding without affecting its issuer</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-07"></a>US-07 | <code>rejects foreign lease binding without affecting its issuer</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-08"></a>US-08 | <code>rejects foreign core binding without affecting its issuer</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-09"></a>US-09 | <code>rejects foreign source binding without affecting its issuer</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-10"></a>US-10 | <code>rejects foreign target binding without affecting its issuer</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-11"></a>US-11 | <code>rejects foreign ready binding without affecting its issuer</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-12"></a>US-12 | <code>rejects foreign parent binding without affecting its issuer</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-13"></a>US-13 | <code>rejects foreign transport binding without affecting its issuer</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-14"></a>US-14 | <code>rejects foreign attempt binding without affecting its issuer</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-15"></a>US-15 | <code>rejects foreign url binding without affecting its issuer</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-16"></a>US-16 | <code>rejects foreign window binding without affecting its issuer</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-17"></a>US-17 | <code>discards the draft on pre_cancel and never resumes after close</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-18"></a>US-18 | <code>discards the draft on post_cancel and never resumes after close</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-19"></a>US-19 | <code>discards the draft on draft_cancel and never resumes after close</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-20"></a>US-20 | <code>discards the draft on pre_close and never resumes after close</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-21"></a>US-21 | <code>discards the draft on post_close and never resumes after close</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-22"></a>US-22 | <code>discards the draft on draft_close and never resumes after close</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-23"></a>US-23 | <code>shares one release-use claim: body_then_status</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-24"></a>US-24 | <code>shares one release-use claim: status_then_body</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-25"></a>US-25 | <code>accepts only synthetic status evidence: release_404_body</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-26"></a>US-26 | <code>accepts only synthetic status evidence: release_403_no_body</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-27"></a>US-27 | <code>accepts only synthetic status evidence: release_404_no_body</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-28"></a>US-28 | <code>does not mint a candidate for hard_401</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-29"></a>US-29 | <code>does not mint a candidate for parent_403</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-30"></a>US-30 | <code>does not mint a candidate for parent_404</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-31"></a>US-31 | <code>does not mint a candidate for unconfirmed</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-32"></a>US-32 | <code>does not mint a candidate for read_started</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-33"></a>US-33 | <code>fails closed at pre_reentry without accepting a draft</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-34"></a>US-34 | <code>fails closed at post_reentry without accepting a draft</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-35"></a>US-35 | <code>fails closed at pre_expired without accepting a draft</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-36"></a>US-36 | <code>fails closed at post_expired without accepting a draft</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-37"></a>US-37 | <code>fails closed at pre_throw without accepting a draft</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-38"></a>US-38 | <code>fails closed at post_throw without accepting a draft</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-39"></a>US-39 | <code>fails closed at clock_rewind without accepting a draft</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-40"></a>US-40 | <code>fails closed at pre_ready_lost without accepting a draft</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-41"></a>US-41 | <code>fails closed at post_ready_lost without accepting a draft</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-42"></a>US-42 | <code>does not adopt token_copy as evidence</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-43"></a>US-43 | <code>does not adopt diagnostic_token as evidence</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-44"></a>US-44 | <code>does not adopt json_token as evidence</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-45"></a>US-45 | <code>does not revive a failed or closed source: missing_ready</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-46"></a>US-46 | <code>does not revive a failed or closed source: missing_parent</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-47"></a>US-47 | <code>does not revive a failed or closed source: duplicate_mint</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-48"></a>US-48 | <code>does not revive a failed or closed source: close_before_consume</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-49"></a>US-49 | <code>does not revive a failed or closed source: stop_before_consume</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-50"></a>US-50 | <code>rejects a foreign method identity</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-51"></a>US-51 | <code>rejects a foreign generation identity</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-52"></a>US-52 | <code>keeps retry exhaustion outside the status acceptance candidates</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-53"></a>US-53 | <code>rejects anything except a fixed case name</code> | null | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-54"></a>US-54 | <code>rejects anything except a fixed case name</code> | 空object | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-55"></a>US-55 | <code>rejects anything except a fixed case name</code> | scenario文字列のみ | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-56"></a>US-56 | <code>rejects anything except a fixed case name</code> | unknown scenario | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-57"></a>US-57 | <code>rejects anything except a fixed case name</code> | session field追加 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-58"></a>US-58 | <code>rejects anything except a fixed case name</code> | allow_fallback field追加 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-59"></a>US-59 | <code>never invokes input getters/proxies or any native I/O</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |
| <a id="o-us-60"></a>US-60 | <code>returns frozen history with all permissions false, no terminal/frame and no promotion path</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 既存の純粋modelのassertionを継続。新assemblyの全case対応へ読み替えない。 実class保証は本caseの対象外。friend非依存の旧純粋modelを継続し、各synthetic fault／履歴を別assembly保証に転用しない。 |

### EK — B-EF：既存共通construction kernel

旧file：[construction-kernel.test.ts](../tests/review/construction-kernel.test.ts)、28件。旧位置で維持する群。特定の新caseへの置換を行わない。

| 行ID | 旧fullName | 入力条件（同名の識別） | 新case | 共有部分 | 分類 | 未代替の保証・残差 |
|---|---|---|---|---|---|---|
| <a id="o-ek-01"></a>EK-01 | <code>creates isolated pending diagnostics without clocks, controllers, timers or I/O</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-02"></a>EK-02 | <code>preserves the fixed public construction reason invalid_input</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-03"></a>EK-03 | <code>preserves the fixed public construction reason authentication_failed</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-04"></a>EK-04 | <code>preserves the fixed public construction reason access_denied</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-05"></a>EK-05 | <code>preserves the fixed public construction reason not_found_or_not_visible</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-06"></a>EK-06 | <code>preserves the fixed public construction reason upstream_unavailable</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-07"></a>EK-07 | <code>preserves the fixed public construction reason deadline_exceeded</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-08"></a>EK-08 | <code>preserves the fixed public construction reason receive_budget_exceeded</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-09"></a>EK-09 | <code>preserves the fixed public construction reason request_budget_exceeded</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-10"></a>EK-10 | <code>preserves the fixed public construction reason payload_budget_exceeded</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-11"></a>EK-11 | <code>preserves the fixed public construction reason payload_limit</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-12"></a>EK-12 | <code>preserves the fixed public construction reason invalid_response</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-13"></a>EK-13 | <code>preserves the fixed public construction reason review_busy</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-14"></a>EK-14 | <code>preserves the fixed public construction reason cancelled</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-15"></a>EK-15 | <code>preserves the fixed public construction reason closed</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-16"></a>EK-16 | <code>preserves the fixed public construction reason changed_during_review</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-17"></a>EK-17 | <code>preserves the fixed public construction reason release_not_admitted</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-18"></a>EK-18 | <code>preserves the fixed public construction reason config_invalid</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-19"></a>EK-19 | <code>preserves the fixed public construction reason phase_deadline_exceeded</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-20"></a>EK-20 | <code>preserves the fixed public construction reason candidate_filter_violation</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-21"></a>EK-21 | <code>preserves the fixed public construction reason internal_review_error</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-22"></a>EK-22 | <code>keeps internal invalid_state distinct from its public mapping</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-23"></a>EK-23 | <code>keeps internal invalid_observation_time distinct from its public mapping</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-24"></a>EK-24 | <code>keeps internal evidence_binding_mismatch distinct from its public mapping</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-25"></a>EK-25 | <code>normalizes unknown reasons without reading, stringifying or retaining supplied objects</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-26"></a>EK-26 | <code>keeps resource facts one-shot and unresolved cleanup sticky through seal</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-27"></a>EK-27 | <code>returns detached immutable construction-only labels rather than binding authority</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |
| <a id="o-ek-28"></a>EK-28 | <code>cannot mutate a real session or its admission by allocating and sealing local kernel states</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 共通kernel単体として維持。実class wrapper／live bindingは別caseの責務で、ラベルからは証明しない。 |

### ET — B-EF：既存実factory・rollback

旧file：[construction-transaction.test.ts](../tests/review/construction-transaction.test.ts)、25件。旧位置で維持する群。特定の新caseへの置換を行わない。

| 行ID | 旧fullName | 入力条件（同名の識別） | 新case | 共有部分 | 分類 | 未代替の保証・残差 |
|---|---|---|---|---|---|---|
| <a id="o-et-01"></a>ET-01 | <code>captures a sealed failure copy when the first clock throws, before creating resources</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |
| <a id="o-et-02"></a>ET-02 | <code>captures a wall-clock serialization failure before admission</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |
| <a id="o-et-03"></a>ET-03 | <code>records and clears the timer returned after a synchronous deadline callback without resuming initialization</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |
| <a id="o-et-04"></a>ET-04 | <code>commits a bound diagnostic owner before timer/listener use and closes each resource once</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |
| <a id="o-et-05"></a>ET-05 | <code>rolls back when controller 1 construction throws without leaking admission</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |
| <a id="o-et-06"></a>ET-06 | <code>rolls back when controller 2 construction throws without leaking admission</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |
| <a id="o-et-07"></a>ET-07 | <code>retains timer-handle uncertainty but still releases controllers and admission</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |
| <a id="o-et-08"></a>ET-08 | <code>removes a partially registered listener using the captured callback after add throws</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |
| <a id="o-et-09"></a>ET-09 | <code>handles synchronous abort during listener registration without replacing cancellation</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |
| <a id="o-et-10"></a>ET-10 | <code>retains the original failure and continues all rollback slots when clearTimeout throws</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |
| <a id="o-et-11"></a>ET-11 | <code>recovers a fixed failure copy when core generation throws</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |
| <a id="o-et-12"></a>ET-12 | <code>recovers a fixed failure copy when owner generation throws</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |
| <a id="o-et-13"></a>ET-13 | <code>latches a stop during owner registration without reading an uninitialized owner</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |
| <a id="o-et-14"></a>ET-14 | <code>never refunds another run admission on a busy rejection</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |
| <a id="o-et-15"></a>ET-15 | <code>keeps direct-new pre-aborted compatibility while the factory returns a released failure copy</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |
| <a id="o-et-16"></a>ET-16 | <code>keeps runtime stops after a successful factory hand-off out of the construction diagnostic</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |
| <a id="o-et-17"></a>ET-17 | <code>reports shell-unavailable without pretending to have a diagnostic owner</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |
| <a id="o-et-18"></a>ET-18 | <code>releases a successful instance if its initial result projection throws</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |
| <a id="o-et-19"></a>ET-19 | <code>rejects invalid first monotonic clock NaN without losing the internal reason</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |
| <a id="o-et-20"></a>ET-20 | <code>rejects invalid first monotonic clock Infinity without losing the internal reason</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |
| <a id="o-et-21"></a>ET-21 | <code>rejects invalid first monotonic clock -1 without losing the internal reason</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |
| <a id="o-et-22"></a>ET-22 | <code>does not execute input accessors/proxies or return raw exceptions from direct new</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |
| <a id="o-et-23"></a>ET-23 | <code>preserves configuration then authentication then busy error precedence</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |
| <a id="o-et-24"></a>ET-24 | <code>cannot accept a caller-provided seed, diagnostic or shell</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |
| <a id="o-et-25"></a>ET-25 | <code>returns immutable failure data with no writer, session, credential or take/retry capability</code> | fullNameで区別 | — | —（新caseへの置換なし） | 維持 | 元のcase自身をそのまま残す。 実factoryのfield順・部分rollback・失敗copy回収を旧caseで維持。開発rootの類似faultで代替しない。 |

## 3 ここから優先して補う対応証拠

1. **release判断と実class固有境界を先に設計**：ACK-08〜16、29、34〜36。現在の新assemblyは`release_match: not_evaluated`で、値projectionとmatched／unknown／mismatched判断は別物。operator config・観測競合・limitationsと、実permit発行を分離した純粋判断の境界が必要。
2. **公開直前の停止とnativeの未網羅点**：SAB-08〜11、NDB-06/08、UN-11〜19/30〜35等。preguard・postguardという名前が似ていても、native issuer／source consumer／draft公開／外側closeの位置が違うため埋め合わせない。正常404/body=true、native低減cap、parent byteLength shadow等も表に残す。
3. **B-03へ渡す保証表とcompiled実行**：本表を使って専用の空出力先・本番と開発の別プロセス・独立oracle・ソースfallback禁止を設計する。現在のcompiled fixture成功は新assemblyのcompiled連続保証ではない。旧fixtureを先に消さない。
4. **friend固有caseの処遇は後続承認**：FR-01、SA-26、ND-30等は、EF-03C/Dのexport／配布閉包不在検査へ変更する候補。今は旧試験・friendを残す。B-KEEP／B-EF／USの維持caseまで一括撤去しない。

旧caseの変更・削除を提案する際は、source revisionと対応先を再照合し、未代替保証と承認状態を個別に追記する。今回この承認欄はすべて未承認。正式発行口・全体受付を開く根拠にしない。

## 4 新case参照カタログ（本表の参照先）

以下は同じ既存JSONから抽出した139件。新IDはfullName／fileへ解決するための参照であり、139件を旧330件へ一対一で対応させたという意味ではない。参照されない新caseも省略せず載せる。

### DR — development-root

[development-root.test.ts](../tests/review/development-root.test.ts)、28件。

| 新ID | 新fullName | 補足 |
|---|---|---|
| <a id="n-dr-01"></a>DR-01 | <code>constructs and closes a fresh development-only run without exporting live authority</code> | — |
| <a id="n-dr-02"></a>DR-02 | <code>keeps two real admission slots and their states unchanged while a same-principal development run opens and closes</code> | — |
| <a id="n-dr-03"></a>DR-03 | <code>allows the second real slot even when both development slots are held and never refunds a busy claimant</code> | — |
| <a id="n-dr-04"></a>DR-04 | <code>uses separate realms across development roots without sharing registration or admission</code> | — |
| <a id="n-dr-05"></a>DR-05 | <code>rolls back after_admission once and permits a distinct new identity</code> | — |
| <a id="n-dr-06"></a>DR-06 | <code>rolls back after_registration once and permits a distinct new identity</code> | — |
| <a id="n-dr-07"></a>DR-07 | <code>rolls back duplicate_registration once and permits a distinct new identity</code> | — |
| <a id="n-dr-08"></a>DR-08 | <code>rolls back foreign_registration once and permits a distinct new identity</code> | — |
| <a id="n-dr-09"></a>DR-09 | <code>rolls back after_controller once and permits a distinct new identity</code> | — |
| <a id="n-dr-10"></a>DR-10 | <code>rolls back after_timer once and permits a distinct new identity</code> | — |
| <a id="n-dr-11"></a>DR-11 | <code>rolls back after_listener once and permits a distinct new identity</code> | — |
| <a id="n-dr-12"></a>DR-12 | <code>rolls back after_commit once and permits a distinct new identity</code> | — |
| <a id="n-dr-13"></a>DR-13 | <code>revokes before abort and returns admission only after the fixed cleanup sequence</code> | — |
| <a id="n-dr-14"></a>DR-14 | <code>rejects a foreign brand before starting registration and preserves a live owner in the same realm</code> | — |
| <a id="n-dr-15"></a>DR-15 | <code>continues all cleanup slots and records uncertainty after a timer disposer throws</code> | — |
| <a id="n-dr-16"></a>DR-16 | <code>captures partial listener registration and removes that exact external listener once</code> | — |
| <a id="n-dr-17"></a>DR-17 | <code>keeps pre cancellation separate and leaves real run state unchanged</code> | — |
| <a id="n-dr-18"></a>DR-18 | <code>keeps pending cancellation separate and leaves real run state unchanged</code> | — |
| <a id="n-dr-19"></a>DR-19 | <code>uses the original lowered deadline and releases a non-cooperative pending wait</code> | — |
| <a id="n-dr-20"></a>DR-20 | <code>does not read accessors, proxies, live sessions or foreign summaries as run input</code> | — |
| <a id="n-dr-21"></a>DR-21 | <code>returns only recursively frozen diagnostics after wait failure with no error text</code> | — |
| <a id="n-dr-22"></a>DR-22 | <code>rejects recursive construction from a clock callback without allocating a second registration</code> | — |
| <a id="n-dr-23"></a>DR-23 | <code>stops invalid initial clock NaN before registration</code> | — |
| <a id="n-dr-24"></a>DR-24 | <code>stops invalid initial clock Infinity before registration</code> | — |
| <a id="n-dr-25"></a>DR-25 | <code>stops invalid initial clock -1 before registration</code> | — |
| <a id="n-dr-26"></a>DR-26 | <code>preserves a canonical invalid-clock reason rather than flattening construction diagnostics</code> | — |
| <a id="n-dr-27"></a>DR-27 | <code>does not resume or mutate a sealed result when a cancelled wait rejects late</code> | — |
| <a id="n-dr-28"></a>DR-28 | <code>follows the production order: a busy claimant allocates nothing and admission precedes registration</code> | — |

### DS — development-source

[development-source.test.ts](../tests/review/development-source.test.ts)、32件。

| 新ID | 新fullName | 補足 |
|---|---|---|
| <a id="n-ds-01"></a>DS-01 | <code>accepts parent then projected release once in a fresh development lifecycle and revokes before seal</code> | — |
| <a id="n-ds-02"></a>DS-02 | <code>rejects foreign run binding and spends the failed lifecycle</code> | — |
| <a id="n-ds-03"></a>DS-03 | <code>rejects foreign snapshot binding and spends the failed lifecycle</code> | — |
| <a id="n-ds-04"></a>DS-04 | <code>rejects foreign lease binding and spends the failed lifecycle</code> | — |
| <a id="n-ds-05"></a>DS-05 | <code>cannot generate another source for the same run by copying the context wrapper</code> | — |
| <a id="n-ds-06"></a>DS-06 | <code>spends generation before a failed preparation and does not restore it after cancellation</code> | — |
| <a id="n-ds-07"></a>DS-07 | <code>rejects duplicate readiness without erasing the first reason or restoring generation</code> | — |
| <a id="n-ds-08"></a>DS-08 | <code>rejects release before parent and never restarts after failure</code> | — |
| <a id="n-ds-09"></a>DS-09 | <code>refuses copy acknowledgements and invalidates the pending own ack</code> | — |
| <a id="n-ds-10"></a>DS-10 | <code>refuses foreign acknowledgements and invalidates the pending own ack</code> | — |
| <a id="n-ds-11"></a>DS-11 | <code>refuses purpose acknowledgements and invalidates the pending own ack</code> | — |
| <a id="n-ds-12"></a>DS-12 | <code>does not consume the same ack twice or allow a second pending issuance</code> | — |
| <a id="n-ds-13"></a>DS-13 | <code>spends a pending ack on cancelled without accepting or resuming it</code> | — |
| <a id="n-ds-14"></a>DS-14 | <code>spends a pending ack on deadline_exceeded without accepting or resuming it</code> | — |
| <a id="n-ds-15"></a>DS-15 | <code>retains the first refusal when a guard reenters consumption</code> | — |
| <a id="n-ds-16"></a>DS-16 | <code>refuses the post-guard stop before accepting the parent</code> | — |
| <a id="n-ds-17"></a>DS-17 | <code>rejects issuance and consumption after revoke, and never changes a sealed summary</code> | — |
| <a id="n-ds-18"></a>DS-18 | <code>allows bounded release rows of length 0 without making a permit</code> | 実データは空release配列。 |
| <a id="n-ds-19"></a>DS-19 | <code>allows bounded release rows of length 1 without making a permit</code> | fullNameのlength 1はit.eachのcase index。実データは21行（1行ではない）。名前は変更していない。 |
| <a id="n-ds-20"></a>DS-20 | <code>rejects an invalid release envelope 0</code> | — |
| <a id="n-ds-21"></a>DS-21 | <code>rejects an invalid release envelope 1</code> | — |
| <a id="n-ds-22"></a>DS-22 | <code>rejects an invalid release envelope 2</code> | — |
| <a id="n-ds-23"></a>DS-23 | <code>rejects an invalid release envelope 3</code> | — |
| <a id="n-ds-24"></a>DS-24 | <code>isolates real-class source, accounting and admission while development source values are accepted</code> | — |
| <a id="n-ds-25"></a>DS-25 | <code>rejects profile accessors, proxies, foreign live objects and excess fields before clock or resource creation</code> | — |
| <a id="n-ds-26"></a>DS-26 | <code>pins source values before awaiting and revokes on cancellation without exposing values</code> | — |
| <a id="n-ds-27"></a>DS-27 | <code>keeps closed source facts immutable after caller mutation and allows a distinct new run after rejection</code> | — |
| <a id="n-ds-28"></a>DS-28 | <code>classifies 22 release rows through the assembly like production, as invalid_response</code> | — |
| <a id="n-ds-29"></a>DS-29 | <code>pins bounded source shapes before constructing a core 0</code> | — |
| <a id="n-ds-30"></a>DS-30 | <code>pins bounded source shapes before constructing a core 1</code> | — |
| <a id="n-ds-31"></a>DS-31 | <code>does not revive a lifecycle revoked during a guard callback</code> | — |
| <a id="n-ds-32"></a>DS-32 | <code>runs source values only inside a fresh assembly and returns a closed non-executable summary</code> | — |

### DB — development-bootstrap

[development-bootstrap.test.ts](../tests/review/development-bootstrap.test.ts)、39件。

| 新ID | 新fullName | 補足 |
|---|---|---|
| <a id="n-db-01"></a>DB-01 | <code>charges fixed parent/release bytes on the same core and returns the final-four reservation once</code> | — |
| <a id="n-db-02"></a>DB-02 | <code>uses the original clock at elapsed 10000 without refreshing the attempt window</code> | — |
| <a id="n-db-03"></a>DB-03 | <code>uses the original clock at elapsed 50000 without refreshing the attempt window</code> | — |
| <a id="n-db-04"></a>DB-04 | <code>uses the original clock at elapsed 60000 without refreshing the attempt window</code> | — |
| <a id="n-db-05"></a>DB-05 | <code>retains charged bytes on aggregate overshoot in the release response</code> | — |
| <a id="n-db-06"></a>DB-06 | <code>refuses caller-supplied status 403 rather than selecting a non-200 or fallback lane</code> | — |
| <a id="n-db-07"></a>DB-07 | <code>refuses caller-supplied status 200 rather than selecting a non-200 or fallback lane</code> | — |
| <a id="n-db-08"></a>DB-08 | <code>refuses malformed transcript or out-of-range limits 0 before dispatch</code> | — |
| <a id="n-db-09"></a>DB-09 | <code>refuses malformed transcript or out-of-range limits 1 before dispatch</code> | — |
| <a id="n-db-10"></a>DB-10 | <code>refuses malformed transcript or out-of-range limits 2 before dispatch</code> | — |
| <a id="n-db-11"></a>DB-11 | <code>refuses malformed transcript or out-of-range limits 3 before dispatch</code> | — |
| <a id="n-db-12"></a>DB-12 | <code>refuses malformed transcript or out-of-range limits 4 before dispatch</code> | — |
| <a id="n-db-13"></a>DB-13 | <code>rejects getter/proxy/shared-storage and injected writer fields without invoking them</code> | — |
| <a id="n-db-14"></a>DB-14 | <code>does not combine value-only source input with an accounting transcript</code> | — |
| <a id="n-db-15"></a>DB-15 | <code>cannot reuse a consumed or disposed transcript to claim another core</code> | — |
| <a id="n-db-16"></a>DB-16 | <code>fails closed on an already claimed core rather than starting a second ledger</code> | — |
| <a id="n-db-17"></a>DB-17 | <code>keeps real-class admission and counters unchanged and never uses network or public source reads</code> | — |
| <a id="n-db-18"></a>DB-18 | <code>uses one byte ledger for synthetic per-user authentication and both source acks</code> | — |
| <a id="n-db-19"></a>DB-19 | <code>uses one byte ledger for synthetic cached authentication and both source acks</code> | — |
| <a id="n-db-20"></a>DB-20 | <code>uses one byte ledger for synthetic exchange authentication and both source acks</code> | — |
| <a id="n-db-21"></a>DB-21 | <code>keeps four requests unavailable to bootstrap at cap 4</code> | — |
| <a id="n-db-22"></a>DB-22 | <code>keeps four requests unavailable to bootstrap at cap 5</code> | — |
| <a id="n-db-23"></a>DB-23 | <code>keeps four requests unavailable to bootstrap at cap 6</code> | — |
| <a id="n-db-24"></a>DB-24 | <code>counts a throw after dispatch exactly once and never retries</code> | — |
| <a id="n-db-25"></a>DB-25 | <code>counts a reject after dispatch exactly once and never retries</code> | — |
| <a id="n-db-26"></a>DB-26 | <code>charges the first whole chunk before rejecting a lowered total_bytes limit</code> | — |
| <a id="n-db-27"></a>DB-27 | <code>charges the first whole chunk before rejecting a lowered response_bytes limit</code> | — |
| <a id="n-db-28"></a>DB-28 | <code>accepts exact aggregate and per-response byte ceilings</code> | — |
| <a id="n-db-29"></a>DB-29 | <code>charges and refuses malformed or foreign parent bytes 0</code> | — |
| <a id="n-db-30"></a>DB-30 | <code>charges and refuses malformed or foreign parent bytes 1</code> | — |
| <a id="n-db-31"></a>DB-31 | <code>charges and refuses malformed or foreign parent bytes 2</code> | — |
| <a id="n-db-32"></a>DB-32 | <code>refuses invalid synthetic OAuth before ready 0</code> | — |
| <a id="n-db-33"></a>DB-33 | <code>refuses invalid synthetic OAuth before ready 1</code> | — |
| <a id="n-db-34"></a>DB-34 | <code>refuses invalid synthetic OAuth before ready 2</code> | — |
| <a id="n-db-35"></a>DB-35 | <code>pins all bytes before await without consuming caller-owned storage or exposing values</code> | — |
| <a id="n-db-36"></a>DB-36 | <code>cancels pending parent with no later charges and returns only its own reservation</code> | — |
| <a id="n-db-37"></a>DB-37 | <code>cancels pending release with no later charges and returns only its own reservation</code> | — |
| <a id="n-db-38"></a>DB-38 | <code>refuses pre-abort without acquiring accounting, dispatching, or reserving</code> | — |
| <a id="n-db-39"></a>DB-39 | <code>fails closed when a chunk does not move G by exactly its own bytes</code> | — |

### DN — development-native

[development-native.test.ts](../tests/review/development-native.test.ts)、28件。

| 新ID | 新fullName | 補足 |
|---|---|---|
| <a id="n-dn-01"></a>DN-01 | <code>cleans the same injected reader without reading and consumes its private proof before source close</code> | — |
| <a id="n-dn-02"></a>DN-02 | <code>accepts status 403 with no body without reader operations or a JSON ack</code> | — |
| <a id="n-dn-03"></a>DN-03 | <code>accepts status 404 with no body without reader operations or a JSON ack</code> | — |
| <a id="n-dn-04"></a>DN-04 | <code>preserves diagnostic-only HTTP 401 and never creates a status acceptance</code> | — |
| <a id="n-dn-05"></a>DN-05 | <code>preserves diagnostic-only HTTP 200 and never creates a status acceptance</code> | — |
| <a id="n-dn-06"></a>DN-06 | <code>preserves diagnostic-only HTTP 500 and never creates a status acceptance</code> | — |
| <a id="n-dn-07"></a>DN-07 | <code>retains rejected cancel as unconfirmed and refuses source acceptance</code> | — |
| <a id="n-dn-08"></a>DN-08 | <code>keeps hard HTTP and failed cleanup in separate diagnostic fields</code> | — |
| <a id="n-dn-09"></a>DN-09 | <code>joins the same pending cleanup after cancellation before returning accounting/admission</code> | — |
| <a id="n-dn-10"></a>DN-10 | <code>bounds pending cleanup by the original floor and never upgrades a late settlement</code> | — |
| <a id="n-dn-11"></a>DN-11 | <code>keeps the shared run deadline distinct from native cancellation control</code> | — |
| <a id="n-dn-12"></a>DN-12 | <code>never acquires an injected reader if parent validation fails or the run is already cancelled</code> | — |
| <a id="n-dn-13"></a>DN-13 | <code>rejects Response and stream reuse across fresh roots without sharing old fixture tables</code> | — |
| <a id="n-dn-14"></a>DN-14 | <code>refuses raw/proxy/copied deliveries and injected cleanup records without invoking accessors</code> | — |
| <a id="n-dn-15"></a>DN-15 | <code>refuses copy rather than promoting a diagnostic into cleanup evidence</code> | — |
| <a id="n-dn-16"></a>DN-16 | <code>refuses foreign_owner rather than promoting a diagnostic into cleanup evidence</code> | — |
| <a id="n-dn-17"></a>DN-17 | <code>refuses foreign_window rather than promoting a diagnostic into cleanup evidence</code> | — |
| <a id="n-dn-18"></a>DN-18 | <code>refuses diagnostic rather than promoting a diagnostic into cleanup evidence</code> | — |
| <a id="n-dn-19"></a>DN-19 | <code>consumes once and makes close invalidate any unconsumed private proof</code> | — |
| <a id="n-dn-20"></a>DN-20 | <code>retains source pre/post guard failures without accepting a known native proof</code> | — |
| <a id="n-dn-21"></a>DN-21 | <code>leaves real-class admission, run diagnostics and byte accounting unchanged</code> | — |
| <a id="n-dn-22"></a>DN-22 | <code>does not invoke shadow Response properties or stream/reader instance methods</code> | — |
| <a id="n-dn-23"></a>DN-23 | <code>does not cancel or release a reader already owned by the caller</code> | — |
| <a id="n-dn-24"></a>DN-24 | <code>retains rejected closed/cancel facts from an errored injected stream</code> | — |
| <a id="n-dn-25"></a>DN-25 | <code>records injected get_reader acquisition/cleanup failure without inventing ownership or success</code> | — |
| <a id="n-dn-26"></a>DN-26 | <code>records injected closed acquisition/cleanup failure without inventing ownership or success</code> | — |
| <a id="n-dn-27"></a>DN-27 | <code>records injected release acquisition/cleanup failure without inventing ownership or success</code> | — |
| <a id="n-dn-28"></a>DN-28 | <code>spends proof on a post-guard stop without committing status acceptance</code> | — |

### SV — source-values

[source-values.test.ts](../tests/review/source-values.test.ts)、12件。

| 新ID | 新fullName | 補足 |
|---|---|---|
| <a id="n-sv-01"></a>SV-01 | <code>validates exactly the five parent columns without retaining caller storage</code> | — |
| <a id="n-sv-02"></a>SV-02 | <code>rejects invalid or foreign parent values 0</code> | — |
| <a id="n-sv-03"></a>SV-03 | <code>rejects invalid or foreign parent values 1</code> | — |
| <a id="n-sv-04"></a>SV-04 | <code>rejects invalid or foreign parent values 2</code> | — |
| <a id="n-sv-05"></a>SV-05 | <code>rejects invalid or foreign parent values 3</code> | — |
| <a id="n-sv-06"></a>SV-06 | <code>rejects invalid or foreign parent values 4</code> | — |
| <a id="n-sv-07"></a>SV-07 | <code>rejects invalid or foreign parent values 5</code> | — |
| <a id="n-sv-08"></a>SV-08 | <code>projects only build_name and preserves missing/null behavior without retaining node data</code> | — |
| <a id="n-sv-09"></a>SV-09 | <code>rejects invalid release row 0</code> | — |
| <a id="n-sv-10"></a>SV-10 | <code>rejects invalid release row 1</code> | — |
| <a id="n-sv-11"></a>SV-11 | <code>rejects invalid release row 2</code> | — |
| <a id="n-sv-12"></a>SV-12 | <code>rejects invalid release row 3</code> | — |
