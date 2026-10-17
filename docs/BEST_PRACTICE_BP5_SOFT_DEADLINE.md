# BP-5：内部期限による早期打切りとpartial返却

Version: bp5-soft-deadline-0.1 / Date: 2026-10-18。
内部アダプターと合成検証。MCP登録・実機操作・公開処理は対象外。
人による規則承認・独立評価の成績は主張しない。

## 1. 変えない境界と工程予算

全体の単調時計はBoundedReadSessionの生成時に開始し、最大60秒を維持する。
認証、HTTP、再試行待ち、worker起動、XML/AST解析、最終照合、集約、worker終了待ちまで同じ予算を使う。
工程を変えても開始時刻・証拠・終了時刻・認証キー・同時実行枠を取り直さない。

| 工程 | 呼出し開始からの内部期限（通常設定） | 期限時 |
|---|---|---|
| 認証/親/リリース/metadata/payload/解析 | 50秒 | 新規payloadを止め、進行中HTTP/再試行待ち/解析を中断 |
| 最終の親＋metadata照合 | 55秒 | 再照合を重ねず、consistency=unverifiedの暫定結果へ進む |
| 集約・JSON検証・worker終了待ち | 60秒 | 固定deadline_exceededのみ。部分結果は返さない |

待機の総予算は各工程の開始から50/55秒ではなく、同じ呼出し開始からの絶対的な残り時間で決まる。
HTTPは従来の最大10秒・最大1再試行と工程残時間の短い方に制限する。受信・回数・payload・出力上限も維持する。
短縮した信頼済みテスト予算では予約時間を全体の1/6、照合後の予約をその半分とする。
通常の60秒なら10秒/5秒となる。利用者入力で時間や上限を指定する機能は追加しない。

OSの停止・イベントループ遅延・terminate完了時間まで含めた厳密な60.000秒以内の返答保証ではない。
全体期限に達した時点で停止を要求し、終了確認まで認証枠を保持する。返却直前にも全体期限とcancelを照合する。

## 2. HTTPとworkerの寿命

BoundedReadSessionに内部用setPhaseReserve/phaseRemainingMsを追加する。HTTP停止用の工程signalは
全体signalとは別に持つため、取得工程の期限後でも、同じsession/認証/回数予算で最後の照合ができる。
全体期限、cancel、401/403や累計容量によるterminal stopは工程の切替では解除しない。
取得中のsignal/listener/timerはfinallyで解放し、遅れて返った応答のbodyも破棄する。
工程期限の内部コードphase_deadline_exceededをHTTPの一時失敗として再試行しない。

解析workerには取得工程の残り時間を渡す。期限切れはterminate/exit待ちの後で返る。
停止済みworkerは再利用せず、同じ呼出しの枠を保持したまま集約用workerを作る。
同時に生存する解析/集約workerは最大1個。通常は1個を再利用し、解析中断があった場合だけ順番に2個を使う。
同期解析への代替実行、別認証主体、無制限requestへのフォールバックは設けない。

## 3. 結果と失敗の契約

- 初回metadataが確定した後の内部打切りはisError=false/status=partial。
  スキーマ検証済み・親で受領済みの解析結果だけを保持する。実行中の行を解析済みには数えない。
- 選択済み行のうち未記録の各行をnot_processed/reason=deadline_exceededとする。
  selected件を重複なくちょうど1回ずつ記録し、countsと指摘数を再集計する。
- limitationsにsoft_deadline_reachedとdeadline_exceeded、errorsに停止stageとdeadline_exceededを記録する。
  既存のJSON列挙値を使い、内部工程コードは結果へ露出させない。coverage.analysis_completeはfalse。
- 照合を完遂できたときだけstable_observation/changedとする。照合期限切れ/失敗はunverifiedとし、
  provisional_results/consistency_unverifiedを付ける。変更検出はchanged_during_reviewを付ける。
- 解析済み0件でも選択行が確定済みなら、全行を未処理としてpartialにできる。
  初回metadataの内部期限切れはcollection.status=failed/status=failedの検証済み集約を添えた固定失敗。
  一覧不明を0件の正常取得と偽装せず、未知のID/件数は作らない。
- 親/リリースの確定前は集約に必要な由来が無いため固定deadline_exceededのみ。
  release unknown/mismatchedの一覧取得禁止は維持する。
- 全体60秒超過、外部cancel、起動不能、想定外例外、1件/集約契約不整合は救済せず固定エラーのみ。
  終了時刻の切詰め・証拠時刻の書換え・非検証結果の返却はしない。
- 最大100指摘/256KiBによる既存の結果単位省略は引き続き適用するため、保持とは上限内での保持を意味する。

1件/集約JSONスキーマ、固定評価セット、規則カタログ、MCP登録は変更しない。

## 4. 合成検証・2026-10-18記録

`tests/review/soft-deadline.test.ts`の13件で以下を確認する。

- 途中打切りで1件の指摘を保持し、残り2件は理由付き未処理、新規payloadは増えない。
- 2件目の非協調的解析を強制停止し、終了済みであることを確認してから集約workerを作る。
- 非協調的fetch/bodyの中断、遅れた応答bodyの破棄、listener除去と同じ主体の枠再利用。
- 再試行待ちを工程期限で止め、同じsessionによる最終照合は可能であること。
- 照合工程自体の期限切れ、soft後の変更/403、全体期限/cancel、集約失敗。
- 最初のpayloadの内部期限切れは、全選択行を理由付きで返すこと。
- 初回metadataの停止は未知の一覧を正常0件と偽装せず、failedとして返すこと。

旧ライフサイクルの短縮期限テスト2件は、新仕様に合わせてリリース段階の内部停止と
集約の全体期限を別々に検証する形へ変更した。解析中断・終了待ちの検証は新規テストと既存cancelテストで維持する。
最初の新規テストは変更前に3件すべて解析されることによる失敗を確認し、実装後に成功した。
再試行テストの初回fixtureはbody無しの429でinvalid_responseとなったため、有効なbody付き429へ修正した。
実コードの再試行条件を緩めて回避していない。
非同期内で更新した工程名の型絞り込みによるTypeScriptエラーも検出し、getterで取得した現在の工程を
catch入口で再設定して解消した。内部打切り後の照合/出力の工程追跡は維持する。

最終検証：

- `bdo npm test`：96ファイル、2,381件成功（新規13件を含む）。
- `bdo npm run type-check`：成功。
- `bdo npm run test:pack`：ビルド成功、353ファイルのtarballで本番依存のみの解析/集約成功。
- 変更実装/テスト/fixtureのESLint：エラー/警告0。`git diff --check`成功。
- 1件/集約スキーマ、固定評価セット、規則カタログ、server/ツール登録、package/lockは変更なし。

通信はすべて合成。時間消費の一部は単調時計のテスト注入で進め、非協調的HTTP/workerは実際の中断を検証する。
macOS/Node v24.18.0で確認し、Node 22.12・Linux/Windows・実機の大規模Update Setは未検証。
運用上の時間配分・独立品質評価・公開の承認は別途必要となる。
