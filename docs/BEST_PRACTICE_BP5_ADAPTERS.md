# BP-5：1件解析・集約アダプター

Version: bp5-adapters-0.2 / Date: 2026-10-18。
内部アダプターと合成HTTPテストの記録。MCP登録・梱包変更・実機操作は対象外。
規則/根拠の人による承認、独立品質評価は未実施。同期解析/集約の強制中断は後続の[worker記録](BEST_PRACTICE_BP5_WORKERS.md)を参照。

## 1. 接続した経路

`reviewBoundedUpdateSet(client, input, options?)`（src/review/update-set-adapter.ts）は、
選択済みclient → bounded source → C方式release gate → metadata → payload → 既存XML/AST解析 →
1件用bp-review-0.2 → 終了時の親/一覧照合 → 集約bp-mcp-review-0.2、の順に接続する。

- inputはupdate_set_sys_id必須、max_records既定20/最大100、requested_rule_ids既定3規則/重複不可。
  追加キー・未実装規則・名前・query・release申告・本文返却指定は拒否する。
- optionsは既存のBoundedReadOptionsによる信頼されたテスト注入のみ。MCP引数ではない。
- sys_cluster_stateの実測または運用者設定がmatchedのときだけ、同じsourceの内部permitで取得する。
  unknown/mismatchedはmetadata取得前に止め、要求全規則を未評価とする。
- payload版のみ。現行レコード、別の認証主体、既存clientの無制限requestへフォールバックしない。

### 1件解析

`reviewUpdateSetPayloadV2`をpayload-review.tsへ追加した。旧入口とXML抽出・acorn・字句スコープ・
定数評価・確認項目の生成を共有するが、release証拠を旧契約のresolvedへ偽装しない。
V2入口自身でもbinding・証拠時刻・必須警告・規則IDを検証する。
この入口は内部用であり、利用者のrelease自己申告を受けるMCPツールではない。

旧bp-review-0.1の入口・プロファイル・出力契約は維持する。V2は常にpartial、candidate/low/info、
検証証拠なし。source_approval_pending、解析範囲の制限、規則別required_follow_upを維持する。
asserted/resolvedの証拠と制限は、集約と入れ子で一致させる。

## 2. 資産の識別・集計

表示用typeを信用せず、nameが`sys_script_<32桁小文字hex>`または`sys_script_client_<32桁小文字hex>`と完全一致するときだけ、BR/Client Scriptの適用規則を選ぶ。
Dictionary/Choiceなどの複合キー名はsys_id形式を要求せず、asset_type_unsupportedでnot_applicableにする。
対象を示す接頭辞で識別子の形が不正な場合はidentity_mismatchにする。ただし`sys_script_include_<sys_id>`など、
別テーブルとして識別できる既存の更新名をBRの接頭辞と取り違えない。DELETE/未知actionの先行判定は従来どおり。
詳細の所属・ID・版・name/actionはbounded sourceが照合し、XML本体のtable/sys_idは抽出器が照合する。
Global scope、Australiaのasync_always、条件ビルダーの入れ子、許可済み補助レコードも既存解析経路を通る。

各選択行をちょうど1個の記述子にする。

| 状態 | 条件 |
|---|---|
| reviewed | 1件用スキーマ検証済み。指摘0でも、規則スキップがあれば解析未完了 |
| not_applicable | 対象外テーブル、または要求規則がその資産に適用されない。clearとは別 |
| skipped_deleted | metadataのaction=DELETE。payloadは取得しない |
| rejected | XML/JSの固定拒否理由、未知action、不正な識別子、1件payload上限超過 |
| retrieval_failed | payload不可視/404、必須列欠落・不正応答、詳細の版変更、使えない更新日時 |
| not_processed | 取得を始められない/完遂できない行。上限や停止理由を残す |
| result_omitted | 指摘数/JSON容量の上限により1件結果を丸ごと省略 |

更新日時はTable APIのUTC形式YYYY-MM-DD HH:mm:ss、またはUTC ISO日時だけを受理する。
不正な日時を現在時刻やnullに差し替えない。invalid_responseは必須列欠落を含むため、
retrieval_failed/missing_required_fieldは「ACLで列が隠れた」と断定する理由ではない。

正常0件、全対象外、全拒否、正常解析で指摘0をそれぞれ集計する。
analysis_completeは取得範囲内の機械処理の完了だけを意味する。規則の妥当性・安全性・人手評価完了ではない。
PoCのstatusはcompletedにせず、通常はpartialとする。

## 3. 失敗の契約

内部戻り値は、正常/暫定時は `{ isError: false, result: AggregateReview }`。
固定失敗は `{ isError: true, error: { stage, code } }`。
検証可能な失敗集約が組める場合だけ、isError=trueにもresultを添える。MCPのCallToolResult自体はまだ作らない。

| 失敗 | 内部戻り値・継続 |
|---|---|
| 入力/設定/認証固定/親の拒否 | isError=true、固定stage/codeのみ。原文・stackなし |
| release不明/不一致/競合 | isError=false、partial、全規則スキップ、指摘0。metadataも取得しない |
| 初回metadata失敗 | isError=true、組めればstatus=failed/collection.status=failedの検証済み集約。空一覧扱いしない |
| 1件の欠落/404/版変更/解析拒否 | 記述子を残し、独立した次の行を予算内で続行 |
| 1件の429/5xx/HTTP timeout | boundedの最大1再試行後はupstream_unavailableで当該行を未処理とし、次の行を続行 |
| 通常HTTP回数の予算切れ | 残りをnot_processedとし、予約済み予算で最後の親/一覧照合を試す |
| 途中の401/403、累計受信/payload上限 | 取得を停止。既存の解析結果があればpartial、なければfailed。残り行を未処理、一貫性はunverified |
| 最終照合の変化/失敗 | changed/unverified、analysis_complete=false、provisional_results。既存候補は暫定として保持 |
| 全体deadline/キャンセル | isError=true、固定理由だけ。部分結果の救済はしない |
| 想定外例外/1件・集約の契約不整合 | isError=true/internal_review_error、その呼出しの指摘を返さない |
| worker起動不能（ready前） | isError=true/worker_unavailable。開発/本番の入口と終了処理は[worker記録§4.1](BEST_PRACTICE_BP5_WORKERS.md)参照 |

全体期限後の集約は、既存のended_at − started_at ≤ 60秒に反する。
終了時刻の切詰めや証拠時刻の書換えで結果を救済しないため、deadline時は固定エラーのみとした。
設計案の一般的な「打切り時はpartial」より、この期限境界の扱いを優先する。
エラー本文、コード/コメント、資産/Update Setの名称、接続先、資格情報、運用者の証跡参照は出力しない。
固定カタログのAPI名や公式根拠URLは返るので、本文非露出テストには本文だけの合成マーカーを使う。

## 4. 上限と残る境界

- 既存のHTTP/件数/受信/payload/認証/同時実行制限をそのまま使う。同時payloadは1件。
- 集約に保持する指摘は最大100。超過した1件結果は丸ごと省略し、指摘の切り貼りをしない。
- JSONは最大256KiB。集約契約の上限から内部エンベロープ用256byteを予約し、必要なら末尾の1件結果から省略する。
  省略理由・ID・内訳は残し、response_truncatedとanalysis_complete=falseを必須にする。
- エラー詳細は最大100件。超過はerror_details_truncatedを残し、資産記述子は削らない。
- 後続で解析/整形をworkerへ移し、アダプターがsessionとworkerの寿命をまとめて所有する方式へ変更した。
  残り予算の伝播・終了待ち・最後の期限照合を行う。OSの実時間保証との区別はworker記録参照。
- ソース/結果は自動保存せず、共有キャッシュも作らない。ログへ本文や原例外を渡さない。

## 5. 合成検証

新規payload-adapter.test.ts / update-set-adapter.test.tsは、外部HTTPと時刻だけを合成し、
実際のbounded source・XML抽出・解析器・両JSON検証器を通す。内部解析器をmockしていない。

正常なBR/Client Script、asserted証拠、リリース停止、入力注入、資産適用、実データと同構造の封筒、
混合/全拒否/空一覧、列欠落/不可視/版変更、401/403、再試行、予約照合、累計容量、単体payload上限、
出力省略、最終照合の変化/失敗、deadline/キャンセル、時計巻戻りでの契約拒否、秘密非露出を確認する。

これらはアダプターの合成回帰テストであり、固定済み検出性能セットや非公開の人手本試行48件とは別物。
未使用人手ケースの作成・使用、実機E2E、MCP登録、npm梱包の変更は行わない。

### 2026-10-18 検証記録

- 新規2ファイル・50テスト成功（1件用8件、集約42件）。HTTPは合成のみ。
- `npm test`：92ファイル、2,330テスト成功。既存2,280件も含む。
- `npm run build` / `npm run type-check`：成功。
- 変更した実装/新規テスト4ファイルのESLint：エラー/警告0。全体lint：エラー0、既存警告374。
- `git diff --check`と新規ファイルの末尾空白確認：成功。
- 既存1件/集約スキーマ、可搬schemas、examples、固定評価器/fixture、server/ツール登録、package/lockはHEADから変更なし。
- TDDで入口未実装の失敗→正常経路の実装を確認し、行ごとの取得失敗、metadata失敗、途中401/403、
  予約照合、出力上限、独立行の続行、日時形式、最終照合失敗について順に失敗→実装→成功を確認した。

新規の非露出テストは、カタログにも含まれるAPI名で判定すると誤って失敗するため、
本文/資格情報/上流エラー/運用者証跡だけの合成マーカーで照合した。
実装の検出精度や人手承認の成績は、この接続テストから主張しない。

## 6. 2026-10-18：対象外の複合キー名への互換修正

従来のclassifyは対象外判定より前に全nameへ`<table>_<sys_id>`形式を要求していた。
そのためsys_dictionary_incident_u_review_demo / sys_choice_incident_u_review_demoのような
正常な対象外更新もidentity_mismatchになり、analysis_completeを不当にfalseにしていた。
上記§2の分類へ変更した。非対象のpayloadは取得せず、metadataの行予算/最終照合には引き続き含める。
機械的なanalysis_complete=trueは対象範囲内の処理完了であり、Dictionary/Choiceのレビューや安全確認ではない。

合成回帰テストを12件追加：Dictionary/Choice 2件、不正なBR/Client Script名6件、
接頭辞の衝突/その他の対象外名3件、BRとの混合1件。実データの名前形式を模した合成名だけを使用する。
検証結果：新規12件を含む`bdo npm test`は94ファイル・2,361テスト成功。
`bdo npm run build` / `bdo npm run type-check`、対象実装/テストのESLint（エラー/警告0）、
`bdo node tests/review/fixtures/compiled-worker-smoke.mjs`、`git diff --check`も成功。
Dictionary/Choiceの2件は修正前の失敗→修正後の成功を確認した。
workerのdeadline/cancel動作、JSON契約、固定評価セット、MCP登録、package/lockは変更していない。

## 7. 早期打切り案（判断待ち・未実装）

全体期限で固定エラーのみを返す現行契約は変更しない。候補は、hard deadlineより前に取得/解析を打ち切り、
既存結果の照合/集約用時間を確保してpartialを返す方式。残り5〜10秒という値は未承認の例であり、保証値ではない。

現行の最終照合は親/metadataの2照会、それぞれ最大10秒・最大2試行のため、
最悪40秒（バックオフ等を除く、かつ全体残時間内）を使う。末尾10秒で新規payloadを止めるだけでは、
実行中のHTTP/解析が残時間を使い切る場合もあり、部分結果を返せるとは限らない。

採用するなら、次を別工程で設計/承認してから実装する。

- 取得/解析のsoft cutoffと、最終照合・集約それぞれの上限。hard deadlineの60秒は延ばさない。
- cutoff前に開始したHTTPのtimeout/再試行も取得工程の期限内に制限する。照合側は専用の短い予算を持つ。
- 進行中の解析をsoft cutoffで止めた場合、終了済みworkerを再利用できないため、
  集約用workerへ切り替える寿命管理を決める。同時生存数・認証枠・hard deadlineは維持する。
- 残り行は未処理、analysis_complete=false。照合失敗はunverified/provisional_resultsとし、安定と偽装しない。
- 工程の打切りと全体期限超過を、固定理由・stage・limitationsで区別する。
  hard deadline/cancel/契約不整合まで救済せず、これらは引き続き固定エラーのみとする。

早期打切りは部分結果を返す機会を増やすための提案であり、OSの遅延や停止を含めた返却保証ではない。
