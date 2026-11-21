# AP05 G02：旧PK01の隔離・終了観測 — 合成対照結果

Version: release-ap05-g02-ed06-ack36-legacy-pk01-synthetic-preflight-result-draft-0.1 / Date: 2026-11-20。

Status: **合成processだけを実施。既知の親・子・孫とstdioの合成対照3件成功。現在の実行環境で専用sandboxの適用と独立したprocess一覧の照会は拒否。H02／H03未充足、旧PK01起動0、候補起動0。** [実行前承認票](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_LEGACY_PK01_ISOLATED_REPRO_APPROVAL.md)を参照。ユーザーの「承認OK」は旧PK01を起動せずに行う小さな合成隔離／終了対照に限る。

## 1 通信の観測と未確認

| 対照 | 観測結果 | 言える範囲 |
|---|---|---|
| 専用sandboxの適用 | 普通の `/usr/bin/true` は終了0。`sandbox-exec` を通すと、network拒否あり／設定を最小にした場合の両方で `sandbox_apply: Operation not permitted`、終了71 | 規則の適用後に通信が拒否された結果ではない。合成ツリーを指定した同じ適用試行も子の開始前に停止。実行環境の違う別ホストに一般化しない |
| 現行の実行制限下での合成親・子・孫 | ローカルの数値loopbackに対する空きportのIPv4／IPv6 bindは3階層すべて `EPERM`。合成子の終了コードは各0 | この環境で各階層で同じbind拒否を観測した。独立の専用遮断が継承されたこと、外向き通信全般の遮断、領域外書込み制限は未確認。listen／connect／DNS照会／送信は行っていない |

## 2 既知の合成processとstdioの終端

旧版と同じNode 24.18.0を絶対指定。合成fixtureのみを、親の子、子の孫として起動。親の `exit`、stdout／stderrの各EOF、外側が所有するstdinの閉鎖と孫側のEOF、直接の親による回収と登録済み合成processの不在照会を別の観測とした。

| 合成対照 | 期待と観測 |
|---|---|
| 正常終了 | 孫のstdin EOFと子による孫回収、親による子回収、外側の親終了・両EOFを観測。登録済み3 processは終了後にすべて不在 |
| 親の先行終了 | 親の終了コード0を受けた時点で孫は生存、stdout／stderrともEOF未着。その後、孫を待つ子の回収と両EOF・登録済みprocessの不在を確認。親終了を全部の完了としない対照 |
| 登録済みの孫の停止 | 親が終了し両pipeが未終端の時点で、識別済みの合成孫だけに `SIGTERM`。直接の親が孫のsignal終了を回収し、両EOFと登録済みprocessの不在を確認。信号の送信成功だけで回収済みとはしない |

未実装時の最初の通常対照は合成fixtureを読めず子が終了1、fixtureを置いた後に通常対照が成功。3件を同条件でもう一度実行し、いずれも成功した。合成用のwatchdogと出力上限はこの対照だけの値で、旧PK01の予算・個別期限には流用しない。独立した `/bin/ps` の照会は起動時に `EPERM`。今回の不在確認は**fixtureが報告した既知のPID**に限り、無報告の子孫やgroupを離れたprocessの完全性は未確認。外側の独立監視・同じ受理票での保全照会も未実証。

隔離領域の合成ファイル指紋（SHA-256）：

- `fixture.mjs`：`85cb5ebf2e92c0f3f426472e0fac512ac2bfaf522fe069b2ad977dd919405e7a`
- `process-control.test.mjs`：`b01eefac52bdb5edcef5f9a65ed13f1fc1f38d09fe966e4f49600501a9ee9560`
- `loopback_bind_probe.py`：`b40f7d217077680d4afc88579f146ecbf91159b867af4b0947a6b5ef3c22b2b9`

## 3 判断

旧PK01用に必要なのは、承認された実行環境で**通信遮断と対象子孫の独立した完全性・終了観測を同時に確保**すること。今回の結果を根拠に旧PK01を現在の条件で起動しない。実施環境と責務先が揃うまでは時間枠・cleanup予約・保全先も未承認のまま。別環境を選ぶ場合も合成対照から開始し、外部通信や旧PK01の起動を先に許可しない。

旧試験と本体は変更なし。旧PK01／候補の起動、空build、npm dry-run、実tarball、実通信、保全操作、設定変更、コミット・Push・公開はいずれも未実施。正式発行口閉鎖・全体受付無効・Unknown・調査保留・閲覧0を維持。
