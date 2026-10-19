# BP-5 R-2 OL-03：共有予算・位置指定読取境界の合成検証

Date: 2026-10-19 / Scope: private予算/I/O境界、合成source/clockのみ。

## 1. 実装した範囲

[保持FD/parser接続設計draft-0.2](BEST_PRACTICE_BP5_R2_OL03_HELD_FD_PARSER_DESIGN.md)の最初の段階を
`signature_boundary/positioned_read.rs`へ追加した。実FD取得・OS pread adapter・parser接続は実装しない。
`PositionedSource`の合成実装がoffset/要求長と単発の応答を記録し、短読取/EINTR/遅延/取消を再現する。
このtraitの成功応答はfile/FDの真正性、OSのpread挙動、cursor不変の実機証拠ではない。

- 共有開始Instantから10秒。各source呼出し前後と明示checkpointで期限/cancelを確認。未来Instantも拒否する。
- 全読取2GiB、対象file32bytes〜512MiB。A/B＋最大preflight＋EOFのchecked予約後に開始し、実bytesを課金、未消費予約はDropで解放する。
- 予約は`2*N + 32 + (1MiB+32) + 2`。小さいfileでもpreflight最大量を保守的に予約するため、残予算が少ないと早期Limitになり得る。
- 通常readは非空64KiB以内、checked offset/終端がN以内。0/正の短読取は補完せず停止。NのEOF probeだけ0応答を受理。
- 通常要求は対象あたり32768回、EINTR再試行は全対象共有8回。成功/新scopeでEINTR枠を回復しない。
- EAGAIN/他I/Oエラー/不正返却量を固定理由で拒否。raw OSStatus/error文字列は入力契約にも出力にも持たない。
- 短読取・遅い成功・取消応答でも、取得済みbytesを先に課金して結果を破棄する。I/O失敗後の現在sliceはboundedにzero化する。
- 最初の失敗をラッチ。同じ台帳はcancel解除・時計巻戻し・新scopeでも再開不可。Debugは固定の非authority表記。
- `account_read`は将来外部adapter向けの課金補助でI/O許可ではない。既存deployment/nativeからは未使用で、容量の事前確保/接続は今後必要。

本番registry未設定、通常v2入口Unavailable、runtime gate92、DER/absence拒否、permitなしは変更しない。
telemetry調査は保留。API実接続・実機/PDI操作・token発行・設定変更は行っていない。

## 2. 追加27テスト

| 群 | 確認した内容 |
|---|---|
| 正常 | 明示offset/要求長、重複読取も課金、chunk64KiB・file終端ちょうど、EOF0応答 |
| 短読取 | 0/1/要求長-1の応答をChanged、補完retryなし、失敗後read/EOFのsource呼出し0回、現在sliceのzero化 |
| EINTR | 8回後の成功、9回目で停止、複数成功/対象をまたぐ共通枠、期限/取消発生後のEINTRを再試行しない |
| I/O拒否 | WouldBlock/他エラー、slice長超過/usize::MAXの壊れた返却量、EOF追加1byte、固定理由と保守的課金 |
| range | 空/64KiB超・終端外・u64::MAX offset、file0/31/512MiB超、source呼出し前の拒否 |
| 台帳 | 正確な予約量/Drop時解放/実課金、2GiBちょうど/超過/overflow、予約分込み残容量、次対象へ実課金持越し、scope要求回数境界・残予約不足 |
| 時間 | 開始期限/未来Instant、10秒直前許可・10秒拒否、scope作成後/次scopeで期限切れ、成功/短読取/エラー/EOFの遅延応答を破棄 |
| 取消/停止 | 開始時/読取直前/実行中の取消、取消解除/時計巻戻しでもラッチ継続、外部課金の遅延応答計上、明示phase checkpoint |
| 非出力 | budget/scopeの固定Debug、sourceのraw error/本文を理由へ渡さない。現在slice以外の全メモリ消去は主張しない |

上限の一部はprivateな合成台帳/counter値を設定して境界だけ確認する。2GiBの実file読取や32768回のOS syscallを実行したものではない。
既存221件＋追加27件＝248件（5 suites）。既存の通常入口停止・gate92・旧0.1 offline・parser33件の回帰を含む。

## 3. 検証と途中の失敗

初回compileで合成sourceのslice長計算と、Resultが保持する可変借用の寿命にE0502が2件発生した。
長さをlocal変数へ分離し、Resultを狭いblockで解放してからsourceを照合するようfixtureを修正。製品の拒否条件は緩めていない。
境界25件成功後、read直前の期限/取消と不正返却量の課金・失敗ラッチの2件を追加した。

```text
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo rustfmt --edition 2024 --check native/r2-outer/tests/fixtures/exec_probe.rs
bdo git -c core.fsmonitor=false diff --check
```

最終結果：全体248件成功（5 suites）、release build成功、Clippy指摘なし、cargo fmt・fixture rustfmt・diff検査成功。
関連7文書のlocal link・code fence・行末空白検査も成功。
依存/Cargo.lock変更なし。TypeScript/MCP E2E・実署名/OS I/O適合は対象外。

## 4. 未対応

実pread adapter、信頼済みopener/保持FD owner、metadata/ACL/xattr・record/role binding・leaseは未接続。
既存deployment/PinnedFileの実読取は新しい台帳にまだ計上されず、全工程の共有上限を実運用で強制したとはしない。
preflight/range抽出、A/B全体hashと採取buffer、純粋parserへの同じ開始Instant/cancelの接続も次工程。
同期I/O hard timeout、OSのEINTR/短読取挙動、失敗時FD解放は合成trait試験では証明しない。
DER意味解析/absence証明、API-CD結合、実署名validity、実行permitへの変換は追加していない。
