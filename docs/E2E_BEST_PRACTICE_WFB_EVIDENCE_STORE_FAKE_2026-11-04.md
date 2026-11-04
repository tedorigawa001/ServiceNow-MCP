# WF-B EvidenceStore：artifact単位fakeの検証記録

Date: 2026-11-04 / 基準HEAD: `7f6ef4f` / 未コミット変更の検証。

## 1 範囲

[内部契約draft-0.1](BEST_PRACTICE_WFB_EVIDENCE_STORE_FAKE_CONTRACT.md)の試験専用storeとメモリ内driverだけを実装した。製品src／設定／依存・既存recorderは変更していない。実FS・既存証拠copy／保管・再採取・実接続・実通信・Pushは行わない。正式発行口閉鎖・全体受付無効・Unknown・調査保留と未承認事項を維持する。

fixture moduleは計算用`node:crypto`だけをimportする。試験driverはMap／配列で排他create・単発操作・同handle再読・故障を表現する。実file・process・network操作は持たない。SHA-256を計算したこと自体は実保存の証明ではない。

## 2 合成対照

- 14固定slot、既存名・再save・path／連番外・別runをcreate前または排他createで拒否。元Map bytesが変わらないことをassertする。
- golden SHA-256は空と`abc`の固定既知値。短書込1byte→EINTR→1byte→1byteを手書きoffset列と操作列へ照合する。0〜2回のretryを丁度許可し、1回超過を拒否。総試行も独立に止める。
- caller bytesのcreate時変更、file／累積byte超過、不正進捗、create／flush／close／再読失敗、同長digest不一致、長さ変更、過大再読、元handleの差替えを確認する。
- 各操作中のroot差替え・取消、期限等値・cleanup枠内外・clock逆行／throw、create中の再入を確認。元reason保持とclose最大1試行を数える。
- opaque receiptのcopy／foreign／summary／wrong run／二重消費を拒否。consume前後のguardで取消を入れ、正当receiptにも二度目がないことを確認する。例外文字列やbyteはsnapshotに出ない。

## 3 実行結果

全コマンドは`bdo`経由。製品・試験の期限は変更しない。

- 初回新規store test: **67件成功**。strict単独TypeScriptとESLintも成功。
- 例外・clock・入力copy等の対照を追加した時点: 新規store＋既存recorderの**2ファイル／168件成功**（新規76件＋既存92件）。その後、accessor例外の対照を1件追加した。
- `npm run build`: 成功。
- 最終の同2ファイル実行: **169件成功**（新規77件＋既存92件）、122ms。accessor例外の対照を含む。
- 最終の新規2ファイルstrict単独TypeScript検査・ESLint: 成功。
- `git diff --check`: 成功。文書リンク先存在と、fixtureのimportが計算用cryptoのみでtests配下が製品build／梱包許可対象外という構成も確認した。構成確認は実梱包成功の代替ではない。

梱包dry-run・全体回帰・compiled保証は今回未実施。前段レビューでの梱包／全体成功を今回の変更の再検証として流用しない。

## 4 未対応

artifact単位fake以外の実保存・directory／file metadata実取得・耐久性・no-replace OS実証・manifest集合・session台帳・recorder ack／四軸接続は未対応。retry／byte／期限は明示合成値だけで、本番の承認capを確定していない。first reason・cleanup結果は失敗診断であり、実FD解放の証明ではない。既存の暫定退避証拠は今回一切操作していない。
