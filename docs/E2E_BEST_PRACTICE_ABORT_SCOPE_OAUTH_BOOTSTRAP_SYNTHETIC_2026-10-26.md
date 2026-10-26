# AU-BR-006 OAuth bootstrap・失敗分類：合成検証

Date: 2026-10-26。対象：[transport設計§17](BEST_PRACTICE_ABORT_SCOPE_TRANSPORT_RECEIPTS_DESIGN.md#17-未認証fixtureのoauth-bootstrapと固定失敗分類)。

## 1. 範囲と維持条件

未認証service-account fixtureから、注入Responseを同じWeb Streams／会計ownerで処理するbootstrapを追加した。固定POST descriptorは実HTTP交換ではなく、credential／token取得・PDI操作・設定変更を行わない。正式発行口・全体受付を閉鎖／無効に維持し、VM／監視／telemetryは保留。本番cap・実session／worker接続・実行permitは対象外。

## 2. 実装

- 明示的な未認証fixtureだけがbootstrap用providerを登録する。未ready／未owner／同session／未claimを要求し、既存transport claimと共有する。per-user・ready済み・生の実sessionを拒否し、baselineや別factoryで認証／予算を作り直さない。
- 注入先へPOST `/oauth_token.do`、合成client_credentials、試行ordinalだけを渡す。任意URL／header／credential／form bodyを受けない。
- 同C/G/S/R／開始時計／期限／cleanupを維持する。EOF／digest／cleanup後にtoken必須項目・Bearerの大小文字非区別／省略互換・token寿命を検査し、同fixture AuthReadyGenerationへ一度だけ進める。tokenは一般receiptにせず、保存・header使用・出力もしない。
- 400等のOAuth拒否、shape不正、寿命不足、retry可能な上流障害、枯渇、開始前拒否、phase／hard期限、全体受信超過、cleanup未確認を分ける。原primaryとcleanup不明を別軸で保持し、closeで上流障害等を上書きしない。
- 低水準fixtureでは認証後も同machineで合成GETを継続できる。prepared ownerへ同sessionのready世代が結ばれることを確認。固定source compositionへの安全なtransport移譲は未接続であり、再claimを代替手段にしない。

## 3. 新規41ケースと独立会計

`tests/review/abort-scope-evidence-oauth-bootstrap.test.ts`。

| 分類 | 確認 |
|---|---|
| 入口／一意性 | C/G=0の未認証fixture開始、固定POST、per-user／ready／実session拒否、重複登録／再bootstrap拒否、認証前の通常用途拒否 |
| 成功／継続 | 同machineのauth_only→parent read、同sessionのowner世代検査、一般bodyなし・正式発行拒否 |
| 応答policy | token欠落／空／CRLF／8,193文字、expires型／負数、token_type不正／大小文字／省略、error併存、寿命59秒／60秒・短縮20msの等号拒否 |
| HTTP／parser | 400／401／403／404は一回で認証失敗、JSON／UTF-8不正、bodyなし、429／503はcleanup後最大2試行 |
| 終端分類 | 2試行枯渇のupstream_unavailable、close後も保持、request枠不足はC/G=0、retry前phase不足とhard期限を別codeで保持 |
| cleanup／取消 | cancel拒否で認証primaryを保持、lock解放失敗はinternal_review_errorをmachineとsession双方に保持、active close／cancel、controller終了中の再入closeでreadyを拒否 |
| 非露出／会計 | 架空のtoken／refresh_token／error_description／例外messageが戻り値・statsへ出ない。Cは注入関数開始数、Gは失敗bodyを含む独立UTF-8合計と照合。E=0、R=4、保持scratchと試行timer解放を確認。run全体のtimerはsession.closeの所有責務 |

last_failure.retryableは失敗試行のsettlement時点のsnapshotで、成功後の再試行権限ではない。retry上限／phase／cleanupはbeginで別途検査する。scopeや本人性、HTTPの認証header動作・PDI接続を証明したテストではない。

## 4. 検証履歴

初回の枯渇終端処理追加後、ビルドはTS2339（Result<never>のsuccess armを除外せずcodeへアクセス）で1回失敗した。実行時の207関連テストは成功していた。generic Resultはneverでもsuccess armを型上含むことを確認し、caller側でokを明示的に判定する最小修正を実施。以後ビルド成功。期限の延長やテストskipは行っていない。

最終確認コマンド：

- `bdo npm run build`：成功。
- `bdo proxy node node_modules/vitest/vitest.mjs run tests/review/abort-scope-evidence-oauth-bootstrap.test.ts`（41/41成功）
- `bdo npm test`：最終154ファイル／4,535件成功（PDI E2Eは含まない）。
- ESLint APIでsrc／tests全体：0 errors、既存374 warnings。
- `bdo proxy env npm_config_cache=/private/tmp/servicenow-mcp-owner-pack-cache npm_config_offline=true node tests/review/package-worker.mjs`：377ファイル、production-only install／解析・集約／MCP／fixture境界smoke成功。新moduleを含む`dist/review/abort-scope-evidence*`の非同梱を確認。
- `bdo git -c core.fsmonitor=false diff --check`：空白エラーなし。

## 5. 未確認と次工程

fixtureのsource ready／release matched／selection／planは合成前提であり取得証拠へ昇格しない。tokenを保持しないため、実認証リクエストの代わりにはならない。認証後の固定sourceへのone-shot移譲、ReleasePermit／payload／worker binding、実token管理・scope／権限検証、最低対応Nodeの実HTTP cleanup・保持work上界・本番cap承認を別工程とする。

新moduleは既存`!dist/review/abort-scope-evidence*`非同梱対象。公開JSON 0.2／0.3、既存認証／通常GET／MCP登録は変更しない。実機操作・設定変更・token発行・Pushは検証に含めない。
