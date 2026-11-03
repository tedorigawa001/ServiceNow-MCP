# PD-B前工程：実accepted headerのprivate供給・合成検証

Date: 2026-11-03 / 基準HEAD: `d1b1193`。
Scope: 合成依存のみ。[供給境界設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_ACCEPTED_HEADER_SUPPLY_DESIGN.md)の同take・固定consumer・失効時破棄を確認する。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持した。

## 1 変更と観測

- 同kernelのtakeが、accept post-guardで保持されたprojectionのheaderとopaque receiptを束ね、元accepted slotを消す。公開snapshotやrootへheader getter／登録口を追加していない。
- private consumerはclaimを先に消費し、元taken object・marker・同owner／plan等・receiptと実projectionの参照を照合する。headerは同pendingの固定保護scopeだけが保持し、既存どおり固定abortする。
- clear／invalidate／payloadPending／isClearedに新保持slotを含める。上位custodyへ移す前に参照をclearし、header本文は診断やcleanup capsuleへ移さない。
- inspectの追加は発行／消費件数・保持bool・error件数だけ。内容比較・PD-A接続・正常seal・完成parts／permit発行は追加していない。

## 2 試験条件と結果

| 検証 | 結果 |
| --- | --- |
| take前→transfer pre→work後post | 発行0→1、元accepted slotなし、private保持→消費1、pending header保持を呼出し外で確認 |
| 固定abort・二重操作 | 消費は1回のまま。再開せず、header／taken参照をclear |
| pre／postで取消・期限切れ | preでは未消費、postでは消費1。元停止理由を保持し、全参照をclearして同custodyへ移譲可能 |
| source close／cleanup開始後 | header発行0・消費0で拒否 |
| 別rootのsummaryを引数として混入 | binding拒否・消費0。他rootは不変で独立に消費可能 |
| postの二重transfer再入をguardが握り潰す | reentrantを保持し、消費1のままclear・custody移譲可能 |
| 本文非公開 | rootにtake／consumeHeaderなし。inspectにsnapshot／projectionReceiptなし |
| 誤seed供給の負の対照 | 最終版テストではerror件数0と期待1の差で1件失敗。変更を戻した後に回帰成功 |

### 初回の負の対照で見つかった試験側の問題

初回はguard内でassertionしていたため、assertion例外が`checkpoint`の通常の失敗処理に回収され、外側の「throwする」期待も満たしてしまった。誤seed供給でも1件成功・40件skipとなり、検出力が不足していた。

観測値をguard内で保存するだけにし、assertionを固定呼出しの外へ移動した。同じ誤seed供給で1件失敗・40件skipとなることを確認した後、正しい`own.header`へ戻した。期限や製品の失敗処理は変更していない。この経緯は製品退行ではなく、新規テストの観測位置の修正として区別する。

## 3 最終確認

- `bdo npm run build`：成功。製品srcのTypeScript buildであり、test-only kernelの独立型検査とは区別する。
- `bdo npx vitest run tests/review/synthetic-*.test.ts`：**41ファイル・3,403件成功**。今回のnormal transferは従来35件から42件へ増加。
- `bdo node tests/review/package-http-classification.mjs`：**成功、441ファイル**。新private markerの漏出負の対照、合成rootのimport／I/O／clock境界、既存compiled fixtureを確認。新header経路自体のcompiled fixtureは追加していない。
- `bdo git diff --check`：成功。

全体の全機能回帰は未実行。実通信・実機操作・実session／worker接続・設定変更・Pushは行っていない。

## 4 残課題・保証しないこと

private receiptを外部へ取り出して偽造・copyを直接consumerへ注入する試験口は作っていない。混入試験は公開されている合成rootの境界で行い、private内部の全組合せ試験と同一視しない。発行後失効はguard取消／期限・再入で、発行前失効はsource／cleanupで確認した。

同P0／Pp／trace・固定deltaと実headerの内容比較、比較claim、full header適合、追加work／保持量・3round配賦、移譲先sealと正常終端は未接続／Unknown。今回の固定error件数確認は誤seed供給の負の対照であり、full header一致や元worker由来の証明ではない。参照clearも物理消去やOS cleanup確認の証拠ではない。
