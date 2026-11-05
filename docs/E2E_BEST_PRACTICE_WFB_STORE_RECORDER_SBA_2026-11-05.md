# WF-B SB-A：同生成元binding・一度限り準備claimの合成検証

Date: 2026-11-05 / 基準HEAD: `2f1120f` / 未コミット変更を検証。

## 1 範囲

[接続差分設計](BEST_PRACTICE_WFB_STORE_RECORDER_BRIDGE_DESIGN.md)のSB-Aだけを実装した。新規module／試験はtests配下で、製品src・設定・依存・既存recorder／EvidenceStoreの実装と旧試験は変更していない。正式発行口閉鎖・全体受付無効・Unknown・調査保留、未承認の保存先・運用cap／時間枠・停止方式は維持する。

再採取・実保管・既存証拠copy・実transport／worker接続・実通信・設定変更・Pushは行わない。固定的なメモリ状態と注入clockだけで検証し、新経路でStoreの全操作が0回であることを対照にする。保存証拠・正式証拠は一切発行しない。

## 2 内部契約と対照

- `tests/review/fixtures/store-recorder-binding.ts`: 先行owner／6準備slot、privateなrun生成WeakSet、別brandのrun・recorder・Store・checkpoint・準備claim。同run keyの再生成は失敗後も拒否する。process間・製品runtimeとの一意性ではない。
- 既存子instanceをprivate fieldに保持し、外へはopaque参照だけを返す。旧prototypeを新参照へ適用するとprivate brandで拒否され、queueは変わらない。公開面にack／save／consume／verify／publishを置かない。
- 同じ元queue先頭のcheckpointからbindingを一度発行し、同じ先頭には同じbindingを返す。コピー・raw checkpoint・summary・別ownerの参照を拒否する。準備claimはpre-guardで消費し、失敗・二重準備・固定discard後に返さない。
- private StoredCheckpointEvidence型と保管slotは予約だけで、issuerはない。claimを得ても保存receiptやack権限にならない。正常条件でもInFlightから固定discardへだけ進み、conditions_readyはqueueに残る。
- 停止時の元queue／first reasonを保持し、私的claim／checkpoint別名をretireする。観測停止と致命的停止は区別し、Reservedの観測停止・D_saveでの閉鎖ではStore.cancelを呼ばない。準備中の観測停止も同じ。
- 5個の`@ts-expect-error`で外部の構造値が各brandへ代入できないことを確認する。これは今回の単独TypeScript検査の負の対照であり、配布済みcompiledコードの保証ではない。

合成の時間期待値は手計算したD_save=288,000／cleanup=289,000／all=300,000ms。旧fakeの明示計画とflush枠内1,000msのcleanup切分けから得る。元開始時点とclock関数をpinし、後から入力のclock・予約・limitを書き換えても変化しない。**運用値の承認ではない。**

## 3 実行結果・途中の型エラー

全コマンドは`bdo`経由。製品・試験の期限／並列設定を緩めていない。

| 検査 | 結果 |
|---|---|
| SB-A初回 | 37件成功 |
| 初回の新規2ファイルstrict単独TypeScript検査 | 3 error。callback後の状態比較にTS2367が2件、freeze返値をclass変数へ渡す箇所にTS2740が1件 |
| 原因対応 | 状態比較を専用private helperへ分離しcallback後の検査を保持。ownerを凍結した後に元class参照を返し、private class型を維持。設定変更・型検査の抑制はしない |
| その後のstrict単独型検査 | 成功。5個のbrand負の対照も有効 |
| 最終の対象3ファイル | **242件成功**（新規42件＋旧recorder／Store 200件）、608ms |
| 新規2ファイルのESLint | 成功 |
| `npm run build` | 成功 |

文書リンク11件・`git diff --check`は成功。新moduleの依存は既存の試験専用fake 2点のみで、testsが製品build／package許可対象外である構成も確認した。これは実梱包成功の証明ではない。全体回帰・梱包dry-run・compiled試験は今回未実施。旧段階の成功を今回の検証へ流用しない。

## 4 レビュー修正（2026-11-05）

`277c057`のレビュー指摘を修正した。§3の件数は修正前の記録で、そのまま残す。

| 指摘 | 修正 |
|---|---|
| 共有clockが停止後に常に例外を返し、Storeが取得済みhandleをcloseできなかった（健全なclockでclose 0回、Store reason `clock`） | 読取・検証と受付を分離。停止後も読め、受付はguardが判定する。不正値と逆行は停止後も拒否する |
| 新しいrun keyなら同じrootに別Storeを作れた | rootもWeakSetでclaimし、失敗後も返さない。入力の`root`は一度だけ読む |
| recorderの誤用・gate拒否がowner理由なしのClosedになった | `state`／`binding`は致命的停止（Store取消）。`cancelled`・`deadline`・`window`は観測停止のまま |
| `D_save`後のdiscardがStoreを取消した | discardもguardを通し、`D_save`以降はClosedで閉鎖する |
| Store配線と`Store.cancel`が未検証だった | `vi.spyOn`で`create`の引数と生成物を取得し、期限・clock・run originと、保存中の停止を検証する。公開面は変えていない |

試験は`vi.spyOn`で子を取得する。観測中の分類試験は、SB-Aにbound ackがないので生の`acknowledge`で`Observing`まで進める。これは準備のためだけで、bound経路の成功実証ではない。

保存中の停止の対照は生のStoreへ直接`save`する。bridgeから保存する経路はなく、SB-Bの実証ではない。

変異70個のうち62個を検出した。残る8個は次の理由で等価または到達不能と判断した。

| 変異 | 理由 |
|---|---|
| `first-reason-overwritten` | `#fatal`は終端後に何もしないので、理由は一度しか書かれない |
| `retire-keeps-claim`、`retire-keeps-binding` | 状態が`retired`になるので、別名が残っても受理されず、外から観測できない |
| `guard-epoch` | 世代が変わるのは致命的停止だけで、直後の状態検査が同じ結果を返す |
| `command-no-clock-reason` | SB-Aのrecorderのclock失敗は共有clock経由で、先に致命的停止になる |
| `checkpoint-slot-check` | sequenceは1〜6で、bound ackがないSB-Aではslotの状態が変わらない |
| `prepare-status` | 二重準備は`InFlight`の状態検査で先に拒否される |
| `discard-any-slot` | claimが入るのは`claimed`のslotだけである |

うち`checkpoint-slot-check`と`command-no-clock-reason`はSB-Bの実装で再評価する。

全スイート（`--maxWorkers=3`）は291ファイル・**14,067件すべて成功**（新規ファイルは77件）。`npm run lint`はエラー0、`npm run build`は成功、`package-http-classification`はPASS（441ファイル）、`git diff --check`も成功。`@ts-expect-error`は次のコマンドで確認した（`tests`は`tsconfig`の対象外で、vitestも型検査をしない）。

```bash
npx tsc --noEmit --strict --target es2022 --module nodenext --moduleResolution nodenext --skipLibCheck --types node tests/review/store-recorder-binding.test.ts
```

梱包dry-runは未実施。

## 5 残課題

1. SB-Bの固定header encoding・同bytes／digest binding・実際のStore save／private consumer・一度限りack。現時点でstore呼出し0、issuerなし、ack成功なし。
2. SB-Cのslot区分別期限表・試行別cleanup結果・連続観測停止／致命的停止・停止後のFIFO保存。準備段階の対照だけで、保存中の取消の継続を実証しない。
3. 元queueを条件として使うので今回到達するのはconditions_readyだけ。6保存slotの完成保証、manifest集合、run全体のpreservation、process終了、session配賦は未対応。
4. `D_save`で閉鎖した後の`observeStop`はrecorderへ伝わらず、recorderは`Reserved`などのまま残る。SB-Cで終端の経路を決める。
5. owner確保失敗は固定fault labelと入力／子生成失敗で模擬した。実OOMやOSの部分resource回収、機密bytesの物理消去を保証しない。六つのslotは準備診断であり、保存試行のcleanup証拠ではない。

結合admissionの成功はR01〜R08充足、実採取・実保管・実process操作の承認ではない。
