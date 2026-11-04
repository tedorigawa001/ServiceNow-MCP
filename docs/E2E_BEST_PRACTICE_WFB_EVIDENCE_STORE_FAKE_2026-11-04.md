# WF-B EvidenceStore：artifact単位fakeの検証記録

Date: 2026-11-04 / 基準HEAD: `7f6ef4f` / 未コミット変更の検証。

## 1 範囲

[内部契約](BEST_PRACTICE_WFB_EVIDENCE_STORE_FAKE_CONTRACT.md)の試験専用storeとメモリ内driverだけを実装した。製品src／設定／依存・既存recorderは変更していない。実FS・既存証拠copy／保管・再採取・実接続・実通信・Pushは行わない。正式発行口閉鎖・全体受付無効・Unknown・調査保留と未承認事項を維持する。

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

## 4 レビュー修正（2026-11-05）

§3の件数（新規77件）は修正前の記録として残す。`3e0d7d5`のレビューで次の問題が分かった。製品src・設定・依存関係は変更していない。

- 長さの検査後、コピー前にguardを呼んでいた。identityのcallbackで可変長バッファを伸ばすと、`fileBytes=8`で64 byteが再読の拒否まで書き込まれた。8 byteへ伸ばした場合は`charged=3`のままreceiptが発行された。検査からcallbackを挟まずにコピーするよう改め、create前の重複guardを除いた。
- `byteLength`を偽るsubclassで、累積上限16 byteに対し32 byteを保存でき、`charged=4`だった。組込みgetterで実サイズを読み、内部slotから複製するよう改めた。再読の長さも同じ方法で判定する。
- cleanup期限（120）を超えて500で返ったcloseが`confirmed`になっていた。期限前の成功返答だけをconfirmedとする。通常のclose経路も同じ処理に揃えた。
- 文字列・数値・`null`等の偽receiptはsticky失敗にならず、正当なreceiptをその後も消費できた。偽objectと同じ`binding`失敗にする。
- first reasonの保持とcleanup中のthrowは未検証だった。`{ fileBytes: 65_537 }`は別の検査で拒否されており、上限の検査を確かめていなかった。「identity検査で時間を使い切る」試験も手前のguardで止まっていた。これらの試験を改めた。消費と検査の順序は観測できないので、試験名からその主張を除いた。
- 本記録§1の本文リンクから版ラベルを除いた。

試験を30件追加し、新規試験は107件になった。既存recorderの92件と合わせて2ファイル**199件成功**。

レビュー時の変異54個のうち29個が検出されなかった。修正後の変異62個（修正箇所に合わせて更新）は59個が検出され、残る3個は次の理由で等価と判断した。

| 検出されない変異 | 判断 |
|---|---|
| digestを`owned`でなく入力から計算 | コピーとhashの間にcallbackがなく、内容が必ず同じ |
| 内部の保存情報を凍結しない | 外部へ渡さず、`consume`は複製を凍結して返す |
| receiptの消費をguardの後へ移動 | 失敗はstickyで再入も拒否するので、順序を観測できない |

修正後の全スイート（`--maxWorkers=3`）は290ファイル・**13,989件すべて成功**。`npm run lint`はエラー0、`npm run build`は成功、`package-http-classification`はPASS（441ファイル）、`git diff --check`も成功。梱包dry-runは未実施。

## 5 未対応

artifact単位fake以外の実保存・directory／file metadata実取得・耐久性・no-replace OS実証・manifest集合・session台帳・recorder ack／四軸接続は未対応。retry／byte／期限は明示合成値だけで、本番の承認capを確定していない。first reason・cleanup結果は失敗診断であり、実FD解放の証明ではない。既存の暫定退避証拠は今回一切操作していない。
