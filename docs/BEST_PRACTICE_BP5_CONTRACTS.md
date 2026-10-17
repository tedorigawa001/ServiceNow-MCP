# BP-5 第1段階：リリース証拠と結果契約

Version: bp5-contracts-0.1 / Date: 2026-10-17。
本書はローカルJSON契約・合成テストの記録。取得プリミティブは[bounded取得記録](BEST_PRACTICE_BP5_BOUNDED_ACQUISITION.md)、C方式は[設定フォールバック記録](BEST_PRACTICE_BP5_OPERATOR_FALLBACK.md)、ファイル読込/権限検査とCLIは[設定導入記録](BEST_PRACTICE_BP5_OPERATOR_SETUP.md)、解析接続は[1件/集約アダプター記録](BEST_PRACTICE_BP5_ADAPTERS.md)を参照。MCP登録・実機操作は未実施。
根拠・規則カードの人による承認、独立品質評価は未実施。

## 1. 互換性と入口

既存の`bp-review-0.1`、解析器の出力、固定評価セットは変更しない。
新契約へ旧結果をバージョン文字列だけ変えて渡すことはできない。
旧構造の共有は行うが、設定申告を`resolved`に偽装して旧検証器へ渡さない。

| 契約 | ランタイム検証 | 可搬JSON Schema | 合成例 |
|---|---|---|---|
| 1件：bp-review-0.2 | `reviewResultV2Schema`（src/review/result-schema-v2.ts） | [1件スキーマ](../schemas/best-practice-review-result-v2.schema.json) | [1件例](../examples/bp5-review-result.json) |
| 集約：bp-mcp-review-0.2 | `aggregateReviewSchema`（src/review/aggregate-schema.ts） | [集約スキーマ](../schemas/best-practice-mcp-review-result.schema.json) | [集約例](../examples/bp5-aggregate-result.json) |

JSON Schemaは構造検証用。時刻・照合・coverage・件数・由来・バイト数などの項目間制約には、必ず対応するランタイム検証器も使う。
`.parse`/`.safeParse`が入力を検証するだけであり、取得・解析・送信は行わない。
追加キーは全オブジェクトで拒否する。エラーは列挙コードだけとし、原エラー・コード本文・URL・資格情報用の項目は設けない。
ただし自由記述欄の内容が本文や秘密を含まないことまでスキーマで保証できないため、アダプターでも固定カタログ/固定理由に生成値を制限する（上記記録参照）。

## 2. C方式の証拠

| source / resolution_status | 証拠 | 検証・制限 |
|---|---|---|
| sys_cluster_state.build_name / resolved | family、raw_buildname、observed_at、caller_acl | familyと値の整合、未来時刻拒否。`release_visible_nodes_only`必須。全ノードの証明ではない |
| operator_config / asserted | family、instance_binding、config_version、asserted_at、expires_at、operator_configured | 対象binding一致、asserted_at ≤ 評価時刻 < expires_at。設定申告・未実測・陳腐化・実測不能の4制限必須 |
| conflict / unknown | observed_families、configured_family、observed_at | 異なる2種類以上のfamily必須。設定で競合を上書きしない。`release_evidence_conflict`必須 |
| none / unknown | reason | 未設定・実測不可・設定期限切れ・binding不一致・観測不完全/不整合/上限超過を区別。同じ理由をlimitationsにも必須 |

証拠の真実性・設定者の信頼性・実接続先とbindingの一致は、この検証器では立証しない。
binding/config_versionは64桁の小文字hex識別子。生成方式と信頼された設定の読み込みは後続で実装済み（設定導入記録参照）。
1件の期限は記録内のreviewed_atと比較し、保存済み結果を後から検証できるよう現在時刻に依存しない。
集約は運用者設定をstarted_atで固定し、asserted_at ≤ started_atかつ
expires_at > started_at + limits.deadline_msを必須とする。終了時刻で期限を再判定しない。
有効でも残り期間が60秒以下なら開始不可（ちょうど60秒も不可）。将来の取得アダプターも同じ条件で
開始を見送り、source=none/unknown、reason=config_validity_insufficient、release_unknownの全規則スキップとして返す。
この開始可否判定は後続の取得プリミティブで実装済み（C方式記録参照）。実測証拠は呼出し中に取得するため、observed_atはended_at以下を確認する。
最大有効期間や更新運用のポリシーは未実装。family列挙の拡張も明示的な契約更新が必要。

## 3. 1件結果

対象はUpdate Set payload版のBR/Client Script、script欄、3規則だけ。
Global scopeの`global`も既存どおり受理する。
証拠からrelease_matchを再計算する。不一致・不明は全要求規則をそれぞれ`release_mismatch`/`release_unknown`でスキップし、評価済み0・指摘0とする。
設定申告はpartial。現PoCは実測でもsource_approval_pendingを必須としcompletedを認めない。
指摘はcandidate/low/info、検証証拠は空配列。カタログ出典・確認項目の語彙/適用規則・coverage・行位置・取得時刻を検証する。
確認項目の自動生成やコード文脈の再検証はこの契約の役割ではなく既存解析器の役割。

## 4. 集約結果

親Update Set・instance binding・規則版・リリース証拠・要求規則の適用範囲を各1件結果と照合する。
選択したsys_update_xmlは重複なく1回ずつ、次のいずれかで返す。
`reviewed` / `not_applicable` / `skipped_deleted` / `rejected` / `retrieval_failed` / `not_processed` / `result_omitted`。
各状態の件数、返却指摘数を再計算し、選択件数との一致を要求する。
未処理は停止理由、省略はresponse_truncatedを必須とし、問題なしへ変換しない。
`analysis_complete`は選択範囲の解析充足であり、品質承認やcompletedとは別。
欠落・中断・metadata切捨て・変更検出・不明な整合性・エラーがあるとtrueにできない。

件数上限1〜100、metadataは上限+1件、指摘100件、JSON 262144 UTF-8 bytes、deadline宣言60000ms。
0 ≤ ended_at − started_at ≤ deadline_msも項目間検証する。60秒ちょうどは可、60秒超過は拒否。
metadata切捨てにはmetadata_truncatedを必須とする。不一致/不明リリースでは一覧取得前に停止し、全要求規則をスキップする。
failed結果はエラーあり・指摘なし・解析不完全を必須とする。
これらは**出力の整合検証**であり、通信・受信量・実行時間の制御を実装したことにはならない。
契約自体は実行を制限しない。後続でHTTP/非同期待機のdeadline中断と受信ストリーム制限、[workerによる同期解析/集約の中断](BEST_PRACTICE_BP5_WORKERS.md)を実装した。契約検証と実行の中断は区別する。

## 5. 合成検証と非対象

tests/review/result-v2.test.ts、aggregate-result.test.ts、bp5-artifacts.test.tsで、申告/実測/不明/競合、期限、対象binding、由来、coverage、状態別集計、上限、省略、厳格キー、版の分離と生成物同期を確認する。
固定済み評価セットは改変しない。今回のテストは契約の検証であり、検出精度・独立ブラインド品質・PDI疎通を主張しない。
MCP登録、設定変更、PDI照会/書き込み、公開、パッケージ構成変更は対象外。

### 検証記録（2026-10-17）

- TDD：新規契約の未実装状態で失敗を確認してから実装。metadata切捨て警告の欠落と初回metadata失敗のpartial偽装についても、追加テストの失敗→制約追加→成功を確認。
- `npm test`：84ファイル・2,171件成功。旧契約と固定セットの再評価テストを含む。
- `npm run build`、`npm run type-check`：成功。
- 変更したTypeScript 7ファイルへのESLint（`--max-warnings 0`）：警告/エラー0。
- `npm run lint`：エラー0、既存箇所の警告374件。今回は無関係箇所を修正しない。
- 固定評価JSON/再評価テストと旧Schema/旧例の13ファイルをHEADとバイト比較し、変更なし。
- 生成した2つのJSON Schemaの同期、全オブジェクトの追加キー拒否、合成例、旧新版の相互誤受理拒否は自動テストで確認。

実機/通信、リリース解決器、MCP呼出し、制限の実行時中断は検証対象外。合成テストの成功をこれらの動作確認と解釈しない。

### 期限境界の訂正（2026-10-17）

元実装では、全1件レビューが期限内でも集約終了だけが期限後の場合、1件は受理され集約だけが拒否されることを合成データで再現した。
終了時の偶発的な無効化を防ぐため、開始時に予算全体を超える有効期間を要求する方式へ変更。
期限が実行途中に来るデータ自体を受理する修正ではなく、開始条件を満たさないものとして拒否する。
単独の1件契約のreviewed_at基準と既存bp-review-0.1/固定評価セットは変更しない。
期限不足・期限一致・1ms余裕、開始後の申告、実行時間の60秒前/一致/1ms超過、開始見送りの理由を回帰テストで検証。
実行中断は後工程であり、期限超過結果のスキーマ拒否を中断の実証とは扱わない。

再検証：`npm test`で84ファイル・2,179件成功、`npm run build`成功、変更TypeScript 3ファイルのESLint（--max-warnings 0）成功、`git diff --check`成功。
旧契約ソース/成果物と固定評価関連14ファイルはHEADとバイト一致。期限境界の失敗を確認してから制約を追加し、回帰テストの成功を確認した。
