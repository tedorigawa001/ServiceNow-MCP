# 校正用22ケース：管理者向け判定案・論点

Version: human-calibration-admin-draft-0.3 / Date: 2026-10-17。
Status: **案。人の承認・校正・採点は未実施。正解ラベルは未確定**。

[採点者向け入力パケット案](BEST_PRACTICE_CALIBRATION_INPUT_PACKET_DRAFT.md)と、
[規則カード案](BEST_PRACTICE_RULE_CARDS_DRAFT.md)を参照。
本書はC/準備会・登録済み方式の裁定/協議担当向けの**公開校正用資料**。
「管理者向け」は用途の区分であり、判定案や対応表を秘密に保つという意味ではない。
ケースのコード・提示メタデータは入力パケットを正本とし、本書では判定案と論点のみを管理する。

## 0. 公開校正の方針と本試行との分離

2026-10-17、利用者が22件を公開校正用とする方針を選択した。入力・判定案・対応表を
リポジトリに置き、この22件の独立ブラインドの成績は主張しない。コード照合や履歴から
判定案にたどり着けるため、ファイル分離・中立ID・配布順序を秘密性の証拠にしない。

初回票を相談せず残すことは校正手順の確認に使えるが、公開判定案への非接触を保証しない。
接触申告は残し、その有無にかかわらず本22件の結果を独立ブラインド成績と呼ばない。
本試行48件は作問開始時から非公開の別権限領域で管理し、この公開作業ツリーには作らない。
詳細は[プロトコル§2.1](BEST_PRACTICE_HUMAN_EVALUATION_PROTOCOL.md)に従う。
人の割当・承認・校正・採点、および本試行の非公開領域設定は未実施。

## 1. 用途・独立性・入力前提

22件（BR-001: 8、BR-002: 8、CL-004: 6）を、規則カードの用語・証拠の閾値・不一致処理の
確認に使う案。本書は議論用であり、承認済み採点カードや期待値ファイルではない。
実装を参照済みのAIが作成した合成例で、独立した人手作問・未使用の検証集合とは呼ばない。
既存の固定評価セットは変更しない。本校正案は版管理して改訂し、本試行48件は別の新規ケースとして準備する。
本書のケース、名前/値/書式だけを変えた派生例、同じシナリオ家族を48件へ流用しない。
家族IDは再利用防止の管理用で、想定正解を採点者へ示すためのものではない。

コードは架空の説明用で、実データのコピー・PDI登録用スクリプトではない。
外部送信、コード実行、PDI書き込み、エンジン採点は実施しない。
この版では資産本文の論点に集中し、Update XML封筒の安全性は評価しない。
言語はES5相当。共通メタデータは**合成前提**であり、実機から取得した事実ではない。

| 群 | 資産種別/対象版 | release/scope/active | 実行種別/条件/UI |
|---|---|---|---|
| B1 | sys_script / 合成payload版 / collection=incident | Australia / global / true | when=after、condition空、filter_condition空、UI非該当 |
| B2 | sys_script / 合成payload版 / collection=incident | Australia / global / true | when=async_always、condition空、filter_condition空、UI非該当 |
| C1 | sys_script_client / 合成payload版 | Australia / global / true | UI Type=Desktop、意図するUI=Classic、onLoad。ClassicのAPI対応保証は前提にしない |

個別記載が共通値に優先する。「本文完全」はケース内の対象本文が提示されている意味で、
インスタンス全体の依存解決済みを意味しない。呼出し元未提示・本文欠落等は各例で明示する。
scope=global（アプリのスコープ）とcollection=global（BR対象テーブル）は別で、共通前提は後者ではない。
抜粋では省略部分に宣言・呼び出しがないと推測しない。本文完全なら宣言されない値を、
根拠なく「外部から供給される未知値」として扱わない。
入力パケットの各コードブロック内を1行目から数えて位置を記録する。初回票で操作単位・位置を決め、
エンジン出力に合わせて後から動かさない。

## 2. 入力対応表（管理専用）

入力パケット版: human-calibration-input-draft-0.1。
並びはSHA-256(seed + 旧ID)の16進表現の昇順。seed=calibration-input-draft-0.1。
これは再現可能な草案の並びで、配布済みの無作為化・署名・封印ではない。
本試行48件の割当シード/ケースとは別管理。対応表は公開校正用であり、秘密ではない。

| packet_id | 旧case_id | family_id | 要求規則 |
|---|---|---|---|
| CP-001 | CAL-B2-05 | CAL-F08 | AU-BR-002 |
| CP-002 | CAL-B1-04 | CAL-F04 | AU-BR-001 |
| CP-003 | CAL-B2-04 | CAL-F07 | AU-BR-002 |
| CP-004 | CAL-C1-02 | CAL-F11 | AU-CL-004 |
| CP-005 | CAL-B1-01 | CAL-F01 | AU-BR-001 |
| CP-006 | CAL-B2-06 | CAL-F05 | AU-BR-002 |
| CP-007 | CAL-C1-06 | CAL-F10 | AU-CL-004 |
| CP-008 | CAL-B1-06 | CAL-F04 | AU-BR-001 |
| CP-009 | CAL-B1-08 | CAL-F01 | AU-BR-001 |
| CP-010 | CAL-B2-01 | CAL-F05 | AU-BR-002 |
| CP-011 | CAL-B1-07 | CAL-F04 | AU-BR-001 |
| CP-012 | CAL-C1-03 | CAL-F12 | AU-CL-004 |
| CP-013 | CAL-B1-03 | CAL-F03 | AU-BR-001 |
| CP-014 | CAL-B1-02 | CAL-F02 | AU-BR-001 |
| CP-015 | CAL-C1-01 | CAL-F10 | AU-CL-004 |
| CP-016 | CAL-B2-07 | CAL-F09 | AU-BR-002 |
| CP-017 | CAL-B1-05 | CAL-F04 | AU-BR-001 |
| CP-018 | CAL-B2-02 | CAL-F06 | AU-BR-002 |
| CP-019 | CAL-C1-05 | CAL-F10 | AU-CL-004 |
| CP-020 | CAL-C1-04 | CAL-F13 | AU-CL-004 |
| CP-021 | CAL-B2-03 | CAL-F06 | AU-BR-002 |
| CP-022 | CAL-B2-08 | CAL-F05 | AU-BR-002 |

## 3. 判定案・未決論点（正解未確定）

### CAL-B1-01 / CP-005 / family CAL-F01：現在レコードへの更新

議論案：candidate。最低証拠はBRのcurrentへの束縛とupdate呼び出し。
workflow項目はnot_required案。再帰発生・実行済みとはせず、経路と業務意図の未確認を分ける。

### CAL-B1-02 / CP-014 / family CAL-F02：同名のローカルオブジェクト

議論案：clear。受信側の定義・呼出し引数を否定証拠とする。
current/updateという名前だけで候補にしない。固有確認項目はN/A。

### CAL-B1-03 / CP-013 / family CAL-F03：受信側不明のupdate

議論案：insufficient。省略部分と現在レコード由来の証拠を追加できるかを問う。
呼出し元不明を「到達しない」「current由来」のいずれの証拠にもしない。
CL-004の受信側不明方針をこの規則へ自動的に流用しない。

### CAL-B1-04 / CP-002 / family CAL-F04：更新前の抑止

議論案：candidate＋workflow_suppression_review=required。
候補を抑制せず、抑止と更新の関係・必要性・副作用・承認範囲を確認する。
抑止効果の実機確認はなく、workflow_suppression_relation_not_verifiedを制限へ記録する案。

### CAL-B1-05 / CP-017 / family CAL-F04：抑止値が不明

議論案：更新候補はcandidateのまま、workflow項目はundetermined。
falseと推測してrequiredにしない。抑止値の不明を更新候補全体のinsufficientと混同しない。

### CAL-B1-06 / CP-008 / family CAL-F04：抑止は更新の後

議論案：candidate、workflow_suppression_review=not_required。
この更新より後の抑止を、この更新の抑止の証拠にしない。setWorkflowという語だけでrequiredにしない。
後続処理全体の安全性・最終的なworkflow状態を保証する判定ではない。

### CAL-B1-07 / CP-011 / family CAL-F04：別レコードだけの抑止

議論案：candidate、workflow_suppression_review=not_required。
抑止の受信側otherと更新の受信側currentの違いを証拠にする。他レコードでの呼び出し自体の
妥当性をこの規則で承認したことにはならない。架空テーブルを実機に作らない。

### CAL-B1-08 / CP-009 / family CAL-F01：非アクティブ資産

議論案：candidateを維持し、limitationsにinactive_assetを付ける。workflow項目はnot_required。
現在有効なBRとして実行されたとはしない。非アクティブをclear/not_applicableへ変換せず、
activeが不明な場合や現行版だけfalseの場合との違いも確認する。

### CAL-B2-01 / CP-010 / family CAL-F05：ガードのないプロパティ参照

議論案：candidate＋async_dependency_review=required。
過去値依存の構文とasync文脈を根拠にする。実際に値が読めた、実行時エラーが発生したとはしない。

### CAL-B2-02 / CP-018 / family CAL-F06：存在確認のみ

**未決の比較**：存在確認も依存設計のcandidateに含める案／過去データ参照ではなくclearとする案。
プロパティ読み取りとは区別する。採用した境界と理由を人が承認するまではgoldを確定しない。
candidateならasync_dependency_reviewはrequired、clearならN/A。項目の有無を先に正解にしない。

### CAL-B2-03 / CP-021 / family CAL-F06：存在ガード内のプロパティ参照

**未決の比較**：実行されない依存設計としてcandidateにする案／ガード内の到達不能を証明できれば除外する案。
asyncでpreviousを利用できないという根拠と、真偽値ガードが成立しない前提を人が確認する。
存在確認のみのCAL-B2-02と別々に決める。構文上の参照を実際の過去値取得とは報告しない。
候補を認めた場合の固有項目はrequired。前提を確認できない場合の保留理由も記入する。

### CAL-B2-04 / CP-003 / family CAL-F07：独自previous・changesメソッド

議論案：clear。同名でもBR提供previous/currentのフィールドではない。
独自定義・引数を否定証拠として記録し、固有項目はN/A。

### CAL-B2-05 / CP-001 / family CAL-F08：条件欄だけの変更判定

議論案：本文規則としてclear。conditionの語を本文へ混ぜない。
条件欄が実機で期待どおり動くことを保証する判定ではない。本文にない固有項目を生成しない。

### CAL-B2-06 / CP-006 / family CAL-F05：whenが不明

議論案：insufficient。非同期かどうかを名前・コード内容から推測しない。
whenがafterと確認された場合のnot_applicableと区別する。

### CAL-B2-07 / CP-016 / family CAL-F09：本文の変更判定

議論案：candidate＋async_dependency_review=required。
CAL-B2-05と比較し、scriptとconditionの配置の証拠を記録する。

### CAL-B2-08 / CP-022 / family CAL-F05：非同期ではないことが確認済み

議論案：AU-BR-002についてnot_applicable。非同期限定という適用条件を満たさないためで、
本文を読んで依存がないとしたclearではない。TNに数えず、async_dependency_reviewはN/A。
CAL-B2-06のwhen不明によるinsufficientとも区別する。他規則への適合は評価しない。

### CAL-C1-01 / CP-015 / family CAL-F10：GlideAjax由来が確認できる

議論案：candidate＋synchronous_ajax_review=required。
非同期推奨の検討と、対象Classic UIでの実際の利用可否の未確認を分ける。実行成功は前提にしない。

### CAL-C1-02 / CP-004 / family CAL-F11：引数で渡された受信側が不明

**未決の比較**：完全なAPI呼び出し式があるのでcandidate＋受信側不明の制限とする案／
GlideAjax由来の積極的証拠がないためinsufficientとする案。
関数が存在するだけで実行済みとはしない。独自メソッドと断定する根拠もない。
candidate案を採るならsynchronous_ajax_review=requiredと
synchronous_ajax_receiver_unresolved。受信側不明の方針をカードで固定する。

### CAL-C1-03 / CP-012 / family CAL-F12：独自の同名メソッド

議論案：clear。独自定義と呼び出しの束縛を否定証拠とする。
同名でもGlideAjaxや同期サーバー照会と断定せず、固有項目はN/A。

### CAL-C1-04 / CP-020 / family CAL-F13：本文が欠落

議論案：insufficient。名前だけは呼び出し式の証拠にならない。
呼び出し式自体は完全に示したCAL-C1-02の受信側不明とは不足の種類を分ける。

### CAL-C1-05 / CP-019 / family CAL-F10：Scoped＋Service Portal＋onSubmit

議論案：candidate＋synchronous_ajax_review=required。
scopeとUIの文献上のAPI非対応を別々に記録し、UI Type=AllやonSubmitの必要性で解除しない。
通常Client ScriptのPortal内での実際の起動経路は別の未確認事項。実際の障害発生とは断定しない。
Catalog/Widgetへ対象範囲を広げず、互換性上の指摘種別の採用も人の承認事項とする。

### CAL-C1-06 / CP-007 / family CAL-F10：実行UIが不明

**未決の比較**：呼び出し証拠による参考候補を保持してUI制約だけを未確認とする案／
UIを適用に不可欠と決めた場合のinsufficient案。カードの「必要なUIメタデータ」の境界を決める。
GlobalやAllだけで全UI対応/非対応と断定しない。候補採用時の固有項目はrequired。

## 4. 校正の手順・決定票（未記入）

1. Cが資料の利用・保管と参加者を承認する。カードの未承認案を検討する準備会と、
   承認した境界の適用を確認する校正を区別し、未承認基準で本試行を開始しない。
2. 準備会では本書の議論案を比較し、特にB2-02/B2-03/C1-02/C1-06の選択肢と根拠を人が決める。
   API非対応と推奨違反、実行の有無、候補と確定違反を分ける。
3. 校正では承認済みカードと入力パケットを用い、R1/R2が他者と相談せず初回票を提出する。
   登録した方式で議論案と比較し、公開判定案への接触も記録する。
   手順確認としての一致/不一致は記録できるが、この22件の独立ブラインド成績は主張しない。
4. ラベル・位置/証拠・確認項目・制限の不一致を残す。カードが曖昧なら改訂・再承認する。
   校正の合意を性能品質や48件の本試行結果へ数えない。
5. 本試行48件は最初から非公開の別権限領域で作成する。作問者には承認済み規範カードだけを渡し、本書/校正例への接触を確認する。
   接触があれば独立性を申告し、家族重複をCが点検する。独立人員が不足すれば準備段階に留める。

以下はケースごとに私有領域で複製する。公開Gitへ署名・秘密情報を追加しない。

| 項目 | 記入欄 |
|---|---|
| packet_id / 旧case_id / family_id / calibration版 / packet版 | [未記入] |
| 規則カード版 / 承認済み境界の節 | [未記入] |
| 用途・状態 | 校正のみ／未実施 |
| 参加者の仮名ID・実装/本書議論案への接触 | [未記入] |
| R1/R2の初回判定・操作位置・証拠 | [未記入] |
| candidate/clear/insufficient/N/Aの境界・必要な追加証拠 | [未記入] |
| 固有確認項目のrequired/not_required/undetermined/N/A | [未記入] |
| 制限・受信側/経路の未確認・例外状態 | [未記入] |
| 裁定方式・不一致・最終合意/annotation_unresolved | [未記入] |
| 採用/不採用案・理由・カード改訂と再承認ID | [未記入] |
| 初回票/協議録/人の署名の私有参照 | [未記入] |
| 本試行からの除外・家族重複点検 | 未実施／[未記入] |

人の承認・実施記録はすべて空欄。エンジン結果との一致による正解の決定はしない。

入力変更時は対応表・判定案・パケット版を一緒に見直し、初回配布後は上書きせず改訂履歴を残す。
