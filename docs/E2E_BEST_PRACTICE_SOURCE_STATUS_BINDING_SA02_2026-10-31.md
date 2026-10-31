# SA-02：実source／session private継続へのfake-I/O binding検証

Date: 2026-10-31。対象：[接続差分設計§11](BEST_PRACTICE_ABORT_SCOPE_STATUS_SOURCE_ACCEPTANCE_DELTA_DESIGN.md)。実通信・実PDI操作ではない。

## 1 実装範囲・非対象

実`BoundedReadSession`／`BoundedUpdateSetSource`を新規固定probeで生成し、同private key・認証snapshot参照・登録lease／core・初期source・ready世代・attemptを結合する。親bytesとstatus観測はdata-onlyの別fake profileでpinする。既存sessionのlookup／登録／切替、caller指定fetch／source／consumerは受け付けない。

sourceのprivate status consumerは一度限りのopaque受領物をtakeし、close前に7権限falseの非実行draftを確定する。fixed-200の既存hook・公開MCP経路・legacy fallbackは変更せず、C方式判定／permit生成も行わない。cleanup enumは合成記録であり、native cleanup由来の証明ではない。

## 2 初回失敗とRED→GREEN

- 最初のトレーサーtestは固定probe未実装で1件失敗（methodなし）。実装後に成功。
- 初回buildはprivate fieldのoptional chain／型queryの構文（TS18030／TS1003）で停止し、テストもtransform段階・実行0件だった。通常のifによるcloseとReturnTypeへ変更してbuild／トレーサー成功を確認した。
- 7権限falseの明示と想定外constructor失敗の固定codeをテストで追加した際、2件REDを確認。権限のfreezeと、session生成後の想定外失敗をinternal_review_errorへ写像する変更でGREEN。
- 関連4ファイル70テスト成功後、ready偽装・draft構築後取消・hard deadlineの条件を追加して専用2ファイル34テスト成功。
- さらにprivate return→外側closeのmicrotask取消、draft構築時のattempt floor到達の2件をREDで再現した。最終guardに元floorを伝播し、summary構築後とawait後／close前にも再検査してGREENとなった。
- constructor失敗の公開codeはinternal_review_errorだったが、owner診断がclosedとなる1件のREDも確認。外側catchで先行失敗をstopへ渡してからfinallyで解放することで、内部診断もinternal_review_errorを保持した。

## 3 合成受入条件と観測

- 403／404・cancelled／no_bodyを実sourceのprivate受理へ一度配送。C=2、Gは独立計算した親bytes長、P=0、返却時の予約0。no_bodyをEOF／空release観測にしない。
- global fetch、legacy session GET、source公開readParent／resolveRelease、permit bindingを呼ばない。
- 不正UTF-8／親の別sys_id／余剰本文、未知profile項目・status・cleanupを拒否。bytesはcaller変更前にcopy。
- 同じcreatorの二重消費、copy／外国constructorのtoken、close後のconsumer呼出しを拒否。外国の成功履歴は不変。
- テスト専用のsource constructor境界置換で不正token・二重呼出しを注入。lifecycle境界のreadonly診断で、内部binding理由を公開codeへ潰さず保持したことを確認。製品に同置換口は存在しない。
- 取消pre／post、draft構築時の取消、ready成功を偽装したhook、unconfirmed cleanup、attempt floor／hard deadline等号を拒否。先行cancelled／deadline理由を後始末で上書きしない。
- 低減request／response／total cap・予約4枠を維持。pending fake delayの中断・timer／admission解放と次run開始を確認。
- summaryはclose済み・fake明示・秘密非出力、fallback／formal issuance disabled・permit unavailable。既存200限定profileへstatusを混ぜる要求は拒否。

## 4 最終検証結果

- `npm run build`：成功。
- 変更source3ファイル／専用test2ファイルのESLint：成功。
- `npm test`：208ファイル・9,362テスト成功。専用2ファイル36テストを含む。元期限・受信量・件数上限を緩和していない。
- `node tests/review/package-http-classification.mjs`：compiled SA-02と既存status各段階が成功。offline・ignore-scriptsのpack dry-runでfixture非同梱と開発専用moduleへの配布runtime参照なしを確認（409ファイル）。SA-02 probe自体は既存runtime class内のfresh fake-only関数であり、MCPには未登録。実fetchは固定throw、既存session採用口はない。
- 関連MDの参照先83件と差分の空白検査を確認。
- 依存再取得を伴うpackage-worker試験は[前工程の環境制約](E2E_BEST_PRACTICE_STATUS_CONSTRUCTOR_BINDING_2026-10-31.md)を継承し、再実行していない。依存インストール後worker smokeの成功は主張しない。

## 5 未確認と閉鎖

実認証／本人性、固定URLからResponseへのbinding、native reader cleanupから本受領物への接続、HTTP／cleanup診断の上位完全配送は未確認。SA-03の承認後C方式判定・fallback、実transport・選択payload／worker・final予約移譲も未実装。

正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。fallback有効化・実接続・実通信・実機操作・設定変更・Pushは行っていない。
